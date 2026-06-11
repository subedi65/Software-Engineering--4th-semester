/**
 * ============================================================================
 * RENDERER.JS - Main Application Logic
 * ============================================================================
 * This is the renderer process script that runs in the Electron window.
 * It handles:
 * - Note management (save, open, delete, create)
 * - Rich text editor integration
 * - Auto-save functionality
 * - Theme switching
 * - UI state management
 *
 * Communication Pattern:
 * Renderer → Main: ipcRenderer.send() or .invoke()
 * Main → Renderer: ipcRenderer.on() or event handlers
 * Bridge: All calls go through window.electronAPI (defined in preload.js)
 * ============================================================================
 */

window.addEventListener('DOMContentLoaded', async () => {
    // ========== DOM ELEMENT REFERENCES ==========
    // Get references to all UI elements we'll interact with
    const richEditor = document.getElementById('rich-editor');
    const saveBtn = document.getElementById('save');
    const statusEl = document.getElementById('save-status');
    const saveAsBtn = document.getElementById('save-as');
    const newNoteBtn = document.getElementById('new-note');
    const openBtn = document.getElementById('open-file');
    const fontIncreaseBtn = document.getElementById('font-increase');
    const fontDecreaseBtn = document.getElementById('font-decrease');
    const noteList = document.getElementById('note-list');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const searchBar = document.getElementById('search-bar');
    const categoryFilter = document.getElementById('category-filter');
    const noteCategorySelect = document.getElementById('note-category-select');

    // ========== APPLICATION STATE VARIABLES ==========
    let currentNoteId = null;          // Tracks which note is currently open
    let lastSavedText = '';            // Stores the last saved content to detect changes
    let currentFontSize = 16;          // Tracks current font size for A+/A- buttons

    // ========== CATEGORY LABEL MAPPINGS ==========
    // Maps category codes to display labels with emojis for visual clarity
    const categoryLabels = {
        none: 'Uncategorized',
        work: '💼 Work',
        personal: '🏠 Personal',
        ideas: '💡 Ideas',
        todo: '✅ To-Do'
    };

    // ========== LOAD TOOLBAR HTML AND INITIALIZE RICH TEXT EDITOR ==========
    // The toolbar HTML is loaded dynamically from toolbar.html file
    // This allows the toolbar to be modular and reusable
    try {
        const response = await fetch('./toolbar.html');
        const toolbarHtml = await response.text();

        // Insert the toolbar HTML into the toolbar container
        document.getElementById('toolbar-container').innerHTML = toolbarHtml;

        // Initialize the rich text editor functionality
        // This is defined in toolbar.js and sets up all formatting button handlers
        if (typeof initializeRichText === 'function') {
            initializeRichText();
            console.log('✅ Rich text toolbar initialized successfully');
        }
    } catch (err) {
        console.error('❌ Failed to load toolbar component:', err);
        // Even if toolbar fails, app continues working with basic editor
    }

    // ========== VERIFY HELPER FUNCTIONS ARE AVAILABLE ==========
    // Check if toolbar.js helper functions are loaded
    if (typeof getRichEditorContent !== 'function' ||
        typeof getRichEditorPlainText !== 'function' ||
        typeof setRichEditorContent !== 'function' ||
        typeof clearRichEditor !== 'function' ||
        typeof focusRichEditor !== 'function') {
        console.warn('⚠️ Warning: Some helper functions from toolbar.js are not available');
        console.log('These functions will be used: getRichEditorContent, getRichEditorPlainText, setRichEditorContent, clearRichEditor, focusRichEditor');
    }

    /**
     * === 1. PERSISTENT THEME SHIFT CONTROLLER ===
     * Manages light/dark theme preference using localStorage for persistence
     * Reads saved preference on startup and applies it immediately
     */
    const savedTheme = localStorage.getItem('app-theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }

    // Theme toggle button click handler
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        if (document.body.classList.contains('dark-theme')) {
            localStorage.setItem('app-theme', 'dark');
            console.log('🌙 Dark theme enabled');
        } else {
            localStorage.setItem('app-theme', 'light');
            console.log('☀️ Light theme enabled');
        }
    });

   
    function updateWordCount() {
        // Get plain text from the rich editor (strips all HTML formatting)
        const text = getRichEditorPlainText();
        const characters = text.length;
        // Split by whitespace to count words, handle empty strings
        const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
        document.getElementById('word-count').textContent = `Words: ${words} | Characters: ${characters}`;
    }

    /**
     * === 3. DYNAMIC EDITOR FONT SIZE MUTATOR ===
     * Allows users to increase/decrease font size with A+/A- buttons
     * Constrains size between 10px (minimum) and 32px (maximum)
     */
    function applyFontSize(size) {
        // Clamp the font size to reasonable bounds
        currentFontSize = Math.min(32, Math.max(10, size));
        richEditor.style.fontSize = `${currentFontSize}px`;
        console.log(`🔤 Font size changed to: ${currentFontSize}px`);
    }

    /**
     * === SAFETY FUNCTION: Confirm Before Discarding Unsaved Text ===
     * Shows a dialog asking user to confirm if they want to discard unsaved changes
     * Compares current editor content with lastSavedText
     *
     * Returns:
     * - true: User confirmed to discard
     * - false: User cancelled action
     */
    async function confirmDiscardIfUnsaved() {
        // Get the current content from the rich editor
        const currentText = getRichEditorPlainText();

        // If there are unsaved changes, ask user to confirm
        if (currentText !== lastSavedText) {
            const result = await window.electronAPI.newNote();
            return result.confirmed;
        }
        return true; // No unsaved changes, safe to proceed
    }

    /**
     * === 4. REAL-TIME NOTE LIST RENDERER ===
     * Fetches all notes from storage and dynamically renders them in the sidebar
     * Supports filtering by search query and category
     *
     * Flow:
     * 1. Fetch notes from IPC (main process)
     * 2. Filter by search term (title/content) and category
     * 3. Sort by pin status and modification date
     * 4. Render HTML for each note with action buttons
     * 5. Attach event listeners for interactions
     */
    async function renderNotes(searchQuery = '', activeCategory = 'all') {
        console.log('📋 renderNotes called with search:', searchQuery, 'category:', activeCategory);

        const sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            console.warn('⚠️ Sidebar element not found!');
            return;
        }

        if (sidebar.style.display === 'none') {
            console.log('ℹ️ Sidebar is hidden, skipping render');
            return;
        }

        const notesArray = await window.electronAPI.getNotes();
        console.log('📂 Got', notesArray.length, 'notes from database');
        noteList.innerHTML = '';

        const query = searchQuery.trim().toLowerCase();

        const filteredNotes = notesArray.filter(note => {
            const matchesTitle = note.title ? note.title.toLowerCase().includes(query) : false;
            const matchesContent = note.content ? note.content.toLowerCase().includes(query) : false;
            const matchesText = matchesTitle || matchesContent;

            let matchesCat = true;
            const noteCat = note.category || 'none';
            if (activeCategory !== 'all') {
                matchesCat = (noteCat === activeCategory);
            }

            return matchesText && matchesCat;
        });

        if (filteredNotes.length === 0) {
            noteList.innerHTML = `<p style="font-size:12px;color:gray;padding:10px;">No matching notes found.</p>`;
            return;
        }

        filteredNotes.sort((a, b) => {
            const pinA = a.isPinned ? 1 : 0;
            const pinB = b.isPinned ? 1 : 0;
            if (pinB !== pinA) {
                return pinB - pinA;
            }
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });

        filteredNotes.forEach(note => {
            const div = document.createElement('div');
            div.className = 'note-item';
            if (note.id === currentNoteId) {
                div.className += ' active';
            }
            if (note.isPinned) {
                div.className += ' pinned';
            }

            const catKey = note.category || 'none';
            const catLabel = categoryLabels[catKey] || 'Uncategorized';

            div.innerHTML = `
                <strong>${note.title || 'Untitled Note'}</strong>
                <div class="note-actions">
                    <button class="popout-btn" title="Open in separate window">🗔</button>
                    <button class="pin-btn" title="Pin Note">📌</button>
                    <button class="delete-btn" data-id="${note.id}">❌</button>
                </div>
                <br>
                <span class="category-badge badge-${catKey}">${catLabel}</span>
                <br>
                <small style="display:inline-block; margin-top:4px;">${new Date(note.updatedAt).toLocaleString()}</small>
            `;

            // SEPARATE WINDOW POP-OUT ACTION INTERCEPTOR
            const popoutBtn = div.querySelector('.popout-btn');
            popoutBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                window.electronAPI.openSeparateWindow(note);
            });

            // Pin Button Controller
            const pinBtn = div.querySelector('.pin-btn');
            pinBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                note.isPinned = !note.isPinned;

                const updatedObject = {
                    id: note.id,
                    isPinned: note.isPinned,
                    updatedAt: new Date().toISOString()
                };

                await window.electronAPI.saveJSONNote(updatedObject);
                await renderNotes(searchBar.value, categoryFilter.value);
            });

            // Protected Sidebar Navigation Click Handler
            // When user clicks a note in the sidebar, load it into the editor
            div.addEventListener('click', async (e) => {
                if (e.target.closest('.note-actions')) return; // Don't trigger on action buttons
                if (note.id === currentNoteId) return; // Already selected

                const allowed = await confirmDiscardIfUnsaved();
                if (!allowed) return; // User cancelled

                // Load note content into rich editor
                currentNoteId = note.id;
                setRichEditorContent(note.content); // Set HTML content
                lastSavedText = note.content;
                noteCategorySelect.value = note.category || 'none';

                statusEl.textContent = 'Note loaded from storage.';
                updateWordCount();
                await renderNotes(searchBar.value, categoryFilter.value);
            });

            // Note Deletion Flow
            // Delete button with confirmation dialog
            const delBtn = div.querySelector('.delete-btn');
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const result = await window.electronAPI.newNote(); // Confirmation dialog
                if (result.confirmed) {
                    await window.electronAPI.deleteNote(note.id);
                    // If deleted note was the current one, clear the editor
                    if (currentNoteId === note.id) {
                        currentNoteId = null;
                        clearRichEditor(); // Clear the rich editor
                        lastSavedText = '';
                        noteCategorySelect.value = 'none';
                        statusEl.textContent = 'Active note destroyed.';
                        updateWordCount();
                    }
                    await renderNotes(searchBar.value, categoryFilter.value);
                }
            });

            noteList.appendChild(div);
        });

        console.log('✅ renderNotes completed:', filteredNotes.length, 'notes displayed');
    }

    // --- 5. ATTACH SEARCH INPUT AND CATEGORY FILTER EVENT LISTENERS ---
    searchBar.addEventListener('input', () => {
        renderNotes(searchBar.value, categoryFilter.value);
    });

    categoryFilter.addEventListener('change', () => {
        renderNotes(searchBar.value, categoryFilter.value);
    });

    // Category selector change handler - update category when user selects different category
    noteCategorySelect.addEventListener('change', async () => {
        if (!currentNoteId) return;

        const notesListCurrent = await window.electronAPI.getNotes();
        const existingNote = notesListCurrent.find(n => n.id === currentNoteId);
        const wasPinned = existingNote ? existingNote.isPinned : false;

        // ✅ FIX: Use getRichEditorPlainText() instead of textarea.value
        const plainText = getRichEditorPlainText();
        const htmlContent = getRichEditorContent();

        const updatedObject = {
            id: currentNoteId,
            category: noteCategorySelect.value,
            title: plainText.trim().split('\n')[0].substring(0, 20) || 'Untitled Note',
            content: htmlContent, // Store HTML to preserve formatting
            isPinned: wasPinned,
            updatedAt: new Date().toISOString()
        };

        await window.electronAPI.saveJSONNote(updatedObject);
        statusEl.textContent = `Category updated to: ${noteCategorySelect.value}`;
        await renderNotes(searchBar.value, categoryFilter.value);
    });

    /**
     * === UNDO/REDO BUTTON HANDLERS ===
     * Handles undo and redo functionality for the rich text editor
     * Uses the browser's native execCommand() for document history
     */
    const undoBtn = document.getElementById('undo');
    const redoBtn = document.getElementById('redo');

    // Undo button - reverts last action (Ctrl+Z)
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            richEditor.focus();
            document.execCommand('undo', false, null);
            console.log('↩️ Undo executed');
        });
    }

    // Redo button - reapplies last undone action (Ctrl+Y)
    if (redoBtn) {
        redoBtn.addEventListener('click', () => {
            richEditor.focus();
            document.execCommand('redo', false, null);
            console.log('↪️ Redo executed');
        });
    }

    // --- 6. APP PLATFORM SYSTEM MENUBAR SYNC ROUTINES ---
    window.electronAPI.onMenuAction('menu-new-note', () => { newNoteBtn.click(); });
    window.electronAPI.onMenuAction('menu-open-file', () => { openBtn.click(); });
    window.electronAPI.onMenuAction('menu-save', () => { saveBtn.click(); });
    window.electronAPI.onMenuAction('menu-save-as', () => { saveAsBtn.click(); });

    /**
     * === 7. CORE UI CONTROL ACTION CLICKS ===
     * Event handlers for all buttons in the toolbar
     */

    /**
     * SAVE BUTTON HANDLER
     * Saves current note to both TXT file (for export) and JSON (for app storage)
     * Uses auto-generated ID if note is new
     */
    saveBtn.addEventListener('click', async () => {
        try {
            // Get content from rich editor (HTML format for formatted text)
            const text = getRichEditorContent();
            console.log('📝 Save button clicked, content length:', text.length);

            // Generate ID if this is a new note
            if (!currentNoteId) {
                currentNoteId = Date.now().toString();
                console.log('🆔 Generated new note ID:', currentNoteId);
            }

            // Show saving status
            statusEl.textContent = 'Saving...';

            // Save as TXT file to desktop (for easy access/backup)
            console.log('💾 Calling saveNote IPC...');
            await window.electronAPI.saveNote(text, null);
            console.log('✅ TXT file saved');

            // Get all existing notes to preserve metadata
            console.log('📂 Getting all notes...');
            const notesListCurrent = await window.electronAPI.getNotes();
            const existingNote = notesListCurrent.find(n => n.id === currentNoteId);
            const wasPinned = existingNote ? existingNote.isPinned : false;

            // Create comprehensive note object with metadata
            const noteObject = {
                id: currentNoteId,
                title: getRichEditorPlainText().trim().split('\n')[0].substring(0, 20) || 'Untitled Note',
                content: text, // Store HTML content for formatting preservation
                isPinned: wasPinned,
                category: noteCategorySelect.value,
                updatedAt: new Date().toISOString()
            };

            // Save to JSON database
            console.log('💾 Calling saveJSONNote IPC...');
            await window.electronAPI.saveJSONNote(noteObject);
            console.log('✅ JSON saved');

            lastSavedText = text; // Update saved state
            statusEl.textContent = 'Note saved successfully (TXT & JSON)';
            console.log('📝 Status updated: "Note saved successfully (TXT & JSON)"');
            console.log('🔄 Calling renderNotes with search:', searchBar.value, 'category:', categoryFilter.value);
            await renderNotes(searchBar.value, categoryFilter.value);
            console.log('✅ Note saved:', noteObject.title);
        } catch (error) {
            console.error('❌ Save error:', error);
            statusEl.textContent = `Save failed: ${error.message}`;
        }
    });

    /**
     * SAVE AS BUTTON HANDLER
     * Opens file dialog to save note with custom filename and location
     * Allows users to export notes to specific directories
     */
    saveAsBtn.addEventListener('click', async () => {
        try {
            const content = getRichEditorContent();
            console.log('📝 Save As button clicked');

            statusEl.textContent = 'Opening file dialog...';
            const result = await window.electronAPI.saveNoteAs(content);
            console.log('✅ File dialog result:', result);

            if (result.success) {
                currentNoteId = result.filePath;
                const fileName = result.filePath.split('\\').pop().split('/').pop(); // Extract filename
                console.log('💾 Saving as:', fileName);

                // Create note metadata with file path as ID
                const noteObject = {
                    id: result.filePath,
                    title: fileName,
                    content: content,
                    isPinned: false,
                    category: noteCategorySelect.value,
                    updatedAt: new Date().toISOString()
                };

                await window.electronAPI.saveJSONNote(noteObject);
                lastSavedText = content;
                statusEl.textContent = `Saved as: ${fileName}`;
                console.log('🔄 Calling renderNotes after Save As with search:', searchBar.value, 'category:', categoryFilter.value);
                await renderNotes(searchBar.value, categoryFilter.value);
                console.log('💾 Note exported to:', fileName);
            } else {
                console.log('ℹ️ Save As cancelled by user');
                statusEl.textContent = 'Save cancelled';
            }
        } catch (error) {
            console.error('❌ Save As error:', error);
            statusEl.textContent = `Save As failed: ${error.message}`;
        }
    });

    /**
     * NEW NOTE BUTTON HANDLER
     * Creates a blank note, but first checks if current note has unsaved changes
     * If there are unsaved changes, shows confirmation dialog
     */
    newNoteBtn.addEventListener('click', async () => {
        const allowed = await confirmDiscardIfUnsaved();
        if (!allowed) return; // User cancelled

        clearRichEditor(); // Clear the editor
        lastSavedText = '';
        currentNoteId = Date.now().toString(); // Generate unique ID based on timestamp
        noteCategorySelect.value = 'none';
        statusEl.textContent = 'New blank note initialized.';
        updateWordCount();
        await renderNotes(searchBar.value, categoryFilter.value);
        focusRichEditor(); // Auto-focus so user can start typing
        console.log('📝 New note created');
    });

    /**
     * OPEN FILE BUTTON HANDLER
     * Opens file dialog to load an external .txt file
     * Converts file content to note and loads into editor
     * Shows unsaved changes warning if current note has content
     */
    openBtn.addEventListener('click', async () => {
        const allowed = await confirmDiscardIfUnsaved();
        if (!allowed) return; // User cancelled

        const result = await window.electronAPI.openFile();
        if (result.success) {
            // Load file content into rich editor
            setRichEditorContent(result.content);
            lastSavedText = result.content;
            currentNoteId = result.filePath; // Use file path as unique ID

            noteCategorySelect.value = 'none';

            // Extract filename from full path
            const fileName = result.filePath.split('\\').pop().split('/').pop();

            // Create note metadata entry
            const noteObject = {
                id: result.filePath,
                title: fileName,
                content: result.content,
                isPinned: false,
                category: 'none',
                updatedAt: new Date().toISOString()
            };

            await window.electronAPI.saveJSONNote(noteObject);

            statusEl.textContent = `Opened File: ${result.filePath}`;
            updateWordCount();
            await renderNotes(searchBar.value, categoryFilter.value);
            focusRichEditor();
            console.log('📂 File opened:', fileName);
        }
    });

    /**
     * === 8. AUTOMATED BACKSTAGE AUTO-SAVE DEBOUNCER SYSTEM ===
     * Automatically saves notes every 5 seconds while user types
     * Prevents data loss and keeps sidebar updated
     *
     * Debouncing:
     * - Waits 5 seconds after last keystroke before saving
     * - Avoids excessive writes to disk
     * - Only saves if content changed since last save
     */
    async function autoSave() {
        const currentContent = getRichEditorContent();

        // Don't save if nothing changed
        if (currentContent === lastSavedText) return;

        try {
            // Generate ID if needed
            if (!currentNoteId) currentNoteId = Date.now().toString();

            // Save TXT version for export
            await window.electronAPI.saveNote(currentContent, null);

            // Get existing notes to preserve metadata
            const notesListCurrent = await window.electronAPI.getNotes();
            const existingNote = notesListCurrent.find(n => n.id === currentNoteId);
            const wasPinned = existingNote ? existingNote.isPinned : false;

            // Create note object with all metadata
            const noteObject = {
                id: currentNoteId,
                title: getRichEditorPlainText().trim().split('\n')[0].substring(0, 20) || 'Untitled Note',
                content: currentContent,
                isPinned: wasPinned,
                category: noteCategorySelect.value,
                updatedAt: new Date().toISOString()
            };

            // Save to JSON database
            await window.electronAPI.saveJSONNote(noteObject);
            lastSavedText = currentContent; // Update saved state
            statusEl.textContent = `Auto-saved at ${new Date().toLocaleTimeString()}`;
            await renderNotes(searchBar.value, categoryFilter.value);
        } catch (err) {
            statusEl.textContent = 'Auto-save failed';
            console.error('❌ Auto-save error:', err);
        }
    }

    // Debounce timer variable - prevents excessive saves
    let debounceTimer;

    // Listen for content changes in the rich editor
    richEditor.addEventListener('input', () => {
        statusEl.textContent = 'Changes detected...';
        updateWordCount();

        // Clear existing timer to reset the countdown
        clearTimeout(debounceTimer);

        // Start new 5-second countdown before auto-save
        debounceTimer = setTimeout(autoSave, 5000);
    });

    // Also listen for contentChanged event from toolbar.js (image insertion, formatting)
    document.addEventListener('contentChanged', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(autoSave, 5000);
    });

    /**
     * === 9. ACCESSIBILITY FONT SIZE HOOKS ===
     * Allow users to increase/decrease font size with A+/A- buttons
     * Font size preference is saved to localStorage for persistence across sessions
     */

    // Increase font size button (A+)
    fontIncreaseBtn.addEventListener('click', async () => {
        applyFontSize(currentFontSize + 2);
        // Save preference to main process so it persists
        await window.electronAPI.saveSettings({ fontSize: currentFontSize });
    });

    // Decrease font size button (A-)
    fontDecreaseBtn.addEventListener('click', async () => {
        applyFontSize(currentFontSize - 2);
        // Save preference to main process so it persists
        await window.electronAPI.saveSettings({ fontSize: currentFontSize });
    });

    /**
     * === 10. DETACHED POP-OUT ROUTINES & DATA INITIAL HYDRATION BOOT ===
     * Initialization code that runs on app startup
     * Loads saved preferences and restores last viewed note
     *
     * Three startup scenarios:
     * 1. Popout window: Shows single note in detached view
     * 2. Normal window with saved notes: Loads most recently modified note
     * 3. Fresh start: Shows welcome message with blank editor
     */

    // Load saved font size preference and apply it
    const settings = await window.electronAPI.getSettings();
    applyFontSize(settings.fontSize || 16);

    // Check if this is a popout window (separate note editing window)
    const popoutNoteData = await window.electronAPI.getPopoutData();

    if (popoutNoteData) {
        // POPOUT MODE: Hide sidebar and controls, show only the note
        console.log('🗔 Opening in detached popout mode');
        document.getElementById('sidebar').style.display = 'none';
        document.querySelector('.category-selector-container').style.display = 'none';
        document.getElementById('new-note').style.display = 'none';

        currentNoteId = popoutNoteData.id;
        setRichEditorContent(popoutNoteData.content);
        lastSavedText = popoutNoteData.content;

        statusEl.textContent = `Detached View: ${popoutNoteData.title || 'Note'}`;
    } else {
        // NORMAL MODE: Load most recent note or show blank editor
        const notes = await window.electronAPI.getNotes();

        if (notes.length > 0) {
            // Find and load the most recently modified note
            const mostRecentNote = notes.reduce((recent, current) => {
                return new Date(current.updatedAt) > new Date(recent.updatedAt) ? current : recent;
            }, notes[0]);

            currentNoteId = mostRecentNote.id;
            setRichEditorContent(mostRecentNote.content);
            lastSavedText = mostRecentNote.content;
            noteCategorySelect.value = mostRecentNote.category || 'none';

            console.log('📂 Loaded most recent note:', mostRecentNote.title);
        } else {
            // Fresh start: Load default note if exists
            const savedNote = await window.electronAPI.loadNote();
            setRichEditorContent(savedNote);
            lastSavedText = savedNote;
            noteCategorySelect.value = 'none';
        }
    }

    // Update UI to reflect initial state
    updateWordCount();
    await renderNotes('', 'all');
    focusRichEditor();

    console.log('✅ App initialized and ready');
});