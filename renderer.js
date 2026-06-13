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
    const favoriteBtn = document.getElementById('favorite-btn');
    const showFavoriteBtn = document.getElementById('show-favorite-btn');

    // ========== APPLICATION STATE VARIABLES ==========
    let currentNoteId = null;          // Tracks which note is currently open
    let lastSavedText = '';            // Stores the last saved content to detect changes
    let currentFontSize = 16;          // Tracks current font size for A+/A- buttons

    // ========== CATEGORY LABEL MAPPINGS ==========
    const categoryLabels = {
        none: 'Uncategorized',
        work: '💼 Work',
        personal: '🏠 Personal',
        ideas: '💡 Ideas',
        todo: '✅ To-Do'
    };

    // ========== LOAD TOOLBAR HTML AND INITIALIZE RICH TEXT EDITOR ==========
    try {
        const response = await fetch('./toolbar.html');
        const toolbarHtml = await response.text();
        document.getElementById('toolbar-container').innerHTML = toolbarHtml;

        if (typeof initializeRichText === 'function') {
            initializeRichText();
            console.log('✅ Rich text toolbar initialized successfully');
        }
    } catch (err) {
        console.error('❌ Failed to load toolbar component:', err);
    }

    // ========== VERIFY HELPER FUNCTIONS ARE AVAILABLE ==========
    if (typeof getRichEditorContent !== 'function' ||
        typeof getRichEditorPlainText !== 'function' ||
        typeof setRichEditorContent !== 'function' ||
        typeof clearRichEditor !== 'function' ||
        typeof focusRichEditor !== 'function') {
        console.warn('⚠️ Warning: Some helper functions from toolbar.js are not available');
    }

    /**
     * === 1. PERSISTENT THEME SHIFT CONTROLLER ===
     */
    const savedTheme = localStorage.getItem('app-theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }

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

    /**
     * === 2. FAVORITE BUTTONS CONTROLLER (FIXED RICH-EDITOR INTEGRATION) ===
     */
    favoriteBtn?.addEventListener('click', () => {
        const content = getRichEditorContent(); // Using Rich Editor Content instead of textarea

        if (!content.trim() || content === '<br>') {
            alert('Please write a note first!');
            return;
        }

        localStorage.setItem('favoriteNote', content);
        alert('⭐ Note saved as Favorite!');
    });

    showFavoriteBtn?.addEventListener('click', () => {
        const favorite = localStorage.getItem('favoriteNote');

        if (!favorite) {
            alert('No favorite note found!');
            return;
        }

        setRichEditorContent(favorite); // Loading content into Rich Editor
        updateWordCount();
        statusEl.textContent = '⭐ Favorite note loaded';
    });

    function updateWordCount() {
        const text = getRichEditorPlainText();
        const characters = text.length;
        const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
        document.getElementById('word-count').textContent = `Words: ${words} | Characters: ${characters}`;
    }

    /**
     * === 3. DYNAMIC EDITOR FONT SIZE MUTATOR ===
     */
    function applyFontSize(size) {
        currentFontSize = Math.min(32, Math.max(10, size));
        richEditor.style.fontSize = `${currentFontSize}px`;
        console.log(`🔤 Font size changed to: ${currentFontSize}px`);
    }

    /**
     * === SAFETY FUNCTION: Confirm Before Discarding Unsaved Text ===
     */
    async function confirmDiscardIfUnsaved() {
        const currentText = getRichEditorPlainText();
        if (currentText !== lastSavedText) {
            const result = await window.electronAPI.newNote();
            return result.confirmed;
        }
        return true; 
    }

    /**
     * === 4. REAL-TIME NOTE LIST RENDERER ===
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
            div.addEventListener('click', async (e) => {
                if (e.target.closest('.note-actions')) return; 
                if (note.id === currentNoteId) return; 

                const allowed = await confirmDiscardIfUnsaved();
                if (!allowed) return; 

                currentNoteId = note.id;
                setRichEditorContent(note.content); 
                lastSavedText = note.content;
                noteCategorySelect.value = note.category || 'none';

                statusEl.textContent = 'Note loaded from storage.';
                updateWordCount();
                await renderNotes(searchBar.value, categoryFilter.value);
            });

            // Note Deletion Flow
            const delBtn = div.querySelector('.delete-btn');
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const result = await window.electronAPI.newNote(); 
                if (result.confirmed) {
                    await window.electronAPI.deleteNote(note.id);
                    if (currentNoteId === note.id) {
                        currentNoteId = null;
                        clearRichEditor(); 
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

    noteCategorySelect.addEventListener('change', async () => {
        if (!currentNoteId) return;

        const notesListCurrent = await window.electronAPI.getNotes();
        const existingNote = notesListCurrent.find(n => n.id === currentNoteId);
        const wasPinned = existingNote ? existingNote.isPinned : false;

        const plainText = getRichEditorPlainText();
        const htmlContent = getRichEditorContent();

        const updatedObject = {
            id: currentNoteId,
            category: noteCategorySelect.value,
            title: plainText.trim().split('\n')[0].substring(0, 20) || 'Untitled Note',
            content: htmlContent, 
            isPinned: wasPinned,
            updatedAt: new Date().toISOString()
        };

        await window.electronAPI.saveJSONNote(updatedObject);
        statusEl.textContent = `Category updated to: ${noteCategorySelect.value}`;
        await renderNotes(searchBar.value, categoryFilter.value);
    });

    /**
     * === UNDO/REDO BUTTON HANDLERS ===
     */
    const undoBtn = document.getElementById('undo');
    const redoBtn = document.getElementById('redo');

    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            richEditor.focus();
            document.execCommand('undo', false, null);
            console.log('↩️ Undo executed');
        });
    }

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
     */
    saveBtn.addEventListener('click', async () => {
        try {
            const text = getRichEditorContent();
            console.log('📝 Save button clicked, content length:', text.length);

            if (!currentNoteId) {
                currentNoteId = Date.now().toString();
                console.log('🆔 Generated new note ID:', currentNoteId);
            }

            statusEl.textContent = 'Saving...';

            console.log('💾 Calling saveNote IPC...');
            await window.electronAPI.saveNote(text, null);
            console.log('✅ TXT file saved');

            console.log('📂 Getting all notes...');
            const notesListCurrent = await window.electronAPI.getNotes();
            const existingNote = notesListCurrent.find(n => n.id === currentNoteId);
            const wasPinned = existingNote ? existingNote.isPinned : false;

            const noteObject = {
                id: currentNoteId,
                title: getRichEditorPlainText().trim().split('\n')[0].substring(0, 20) || 'Untitled Note',
                content: text, 
                isPinned: wasPinned,
                category: noteCategorySelect.value,
                updatedAt: new Date().toISOString()
            };

            console.log('💾 Calling saveJSONNote IPC...');
            await window.electronAPI.saveJSONNote(noteObject);
            console.log('✅ JSON saved');

            lastSavedText = text; 
            statusEl.textContent = 'Note saved successfully (TXT & JSON)';
            await renderNotes(searchBar.value, categoryFilter.value);
            console.log('✅ Note saved:', noteObject.title);
        } catch (error) {
            console.error('❌ Save error:', error);
            statusEl.textContent = `Save failed: ${error.message}`;
        }
    });

    saveAsBtn.addEventListener('click', async () => {
        try {
            const content = getRichEditorContent();
            console.log('📝 Save As button clicked');

            statusEl.textContent = 'Opening file dialog...';
            const result = await window.electronAPI.saveNoteAs(content);
            console.log('✅ File dialog result:', result);

            if (result.success) {
                currentNoteId = result.filePath;
                const fileName = result.filePath.split('\\').pop().split('/').pop(); 
                console.log('💾 Saving as:', fileName);

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

    newNoteBtn.addEventListener('click', async () => {
        const allowed = await confirmDiscardIfUnsaved();
        if (!allowed) return; 

        clearRichEditor(); 
        lastSavedText = '';
        currentNoteId = Date.now().toString(); 
        noteCategorySelect.value = 'none';
        statusEl.textContent = 'New blank note initialized.';
        updateWordCount();
        await renderNotes(searchBar.value, categoryFilter.value);
        focusRichEditor(); 
        console.log('📝 New note created');
    });

    openBtn.addEventListener('click', async () => {
        const allowed = await confirmDiscardIfUnsaved();
        if (!allowed) return; 

        const result = await window.electronAPI.openFile();
        if (result.success) {
            setRichEditorContent(result.content);
            lastSavedText = result.content;
            currentNoteId = result.filePath; 

            noteCategorySelect.value = 'none';
            const fileName = result.filePath.split('\\').pop().split('/').pop();

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
     */
    async function autoSave() {
        const currentContent = getRichEditorContent();
        if (currentContent === lastSavedText) return;

        try {
            if (!currentNoteId) currentNoteId = Date.now().toString();

            await window.electronAPI.saveNote(currentContent, null);

            const notesListCurrent = await window.electronAPI.getNotes();
            const existingNote = notesListCurrent.find(n => n.id === currentNoteId);
            const wasPinned = existingNote ? existingNote.isPinned : false;

            const noteObject = {
                id: currentNoteId,
                title: getRichEditorPlainText().trim().split('\n')[0].substring(0, 20) || 'Untitled Note',
                content: currentContent,
                isPinned: wasPinned,
                category: noteCategorySelect.value,
                updatedAt: new Date().toISOString()
            };

            await window.electronAPI.saveJSONNote(noteObject);
            lastSavedText = currentContent; 
            statusEl.textContent = `Auto-saved at ${new Date().toLocaleTimeString()}`;
            await renderNotes(searchBar.value, categoryFilter.value);
        } catch (err) {
            statusEl.textContent = 'Auto-save failed';
            console.error('❌ Auto-save error:', err);
        }
    }

    let debounceTimer;

    richEditor.addEventListener('input', () => {
        statusEl.textContent = 'Changes detected...';
        updateWordCount();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(autoSave, 5000);
    });

    document.addEventListener('contentChanged', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(autoSave, 5000);
    });

    /**
     * === 9. ACCESSIBILITY FONT SIZE HOOKS ===
     */
    fontIncreaseBtn.addEventListener('click', async () => {
        applyFontSize(currentFontSize + 2);
        await window.electronAPI.saveSettings({ fontSize: currentFontSize });
    });

    fontDecreaseBtn.addEventListener('click', async () => {
        applyFontSize(currentFontSize - 2);
        await window.electronAPI.saveSettings({ fontSize: currentFontSize });
    });

    /**
     * === 10. INITIAL HYDRATION BOOT ===
     */
    const settings = await window.electronAPI.getSettings();
    applyFontSize(settings.fontSize || 16);

    const popoutNoteData = await window.electronAPI.getPopoutData();

    if (popoutNoteData) {
        console.log('🗔 Opening in detached popout mode');
        document.getElementById('sidebar').style.display = 'none';
        document.querySelector('.category-selector-container').style.display = 'none';
        document.getElementById('new-note').style.display = 'none';

        currentNoteId = popoutNoteData.id;
        setRichEditorContent(popoutNoteData.content);
        lastSavedText = popoutNoteData.content;

        statusEl.textContent = `Detached View: ${popoutNoteData.title || 'Note'}`;
    } else {
        const notes = await window.electronAPI.getNotes();

        if (notes.length > 0) {
            const mostRecentNote = notes.reduce((recent, current) => {
                return new Date(current.updatedAt) > new Date(recent.updatedAt) ? current : recent;
            }, notes[0]);

            currentNoteId = mostRecentNote.id;
            setRichEditorContent(mostRecentNote.content);
            lastSavedText = mostRecentNote.content;
            noteCategorySelect.value = mostRecentNote.category || 'none';

            console.log('📂 Loaded most recent note:', mostRecentNote.title);
        } else {
            const savedNote = await window.electronAPI.loadNote();
            setRichEditorContent(savedNote);
            lastSavedText = savedNote;
            noteCategorySelect.value = 'none';
        }
    }

    updateWordCount();
    await renderNotes('', 'all');
    focusRichEditor();

    console.log('✅ App initialized and ready');
});