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
 * - Trash / soft-delete system
 * - Voice dictation
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

    // Trash elements (from latest-amit-roy)
    const trashToggleBtn = document.getElementById('trash-toggle');
    const trashPanel = document.getElementById('trash-panel');
    const trashList = document.getElementById('trash-list');
    const trashCountEl = document.getElementById('trash-count');

    // Voice dictation elements (from latest-amit-roy)
    const dictationToggleBtn = document.getElementById('dictation-toggle');
    const dictationLangSelect = document.getElementById('dictation-lang');

    // ========== APPLICATION STATE VARIABLES ==========
    let currentNoteId = null;          // Tracks which note is currently open
    let lastSavedText = '';            // Stores the last saved content to detect changes
    let currentFontSize = 16;          // Tracks current font size for A+/A- buttons
    let isDictating = false;
    let recognition = null;
    let debounceTimer = null;

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

    function updateWordCount() {
        const text = getRichEditorPlainText();
        const characters = text.length;
        const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
        document.getElementById('word-count').textContent = `Words: ${words} | Characters: ${characters}`;
    }

    /**
     * === DYNAMIC EDITOR FONT SIZE MUTATOR ===
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

    // ==========================================
    // SECURE SPEECH DICTATION RECOGNITION PIPELINE (from latest-amit-roy)
    // ==========================================
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        if (dictationToggleBtn) {
            dictationToggleBtn.disabled = true;
            dictationToggleBtn.textContent = "🎙️ Unsupported";
        }
    } else {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false; // Blocks fragmented inputs from triggering collision crashes

        recognition.onstart = () => {
            isDictating = true;
            if (dictationToggleBtn) {
                dictationToggleBtn.textContent = "🛑 Stop Listening";
                dictationToggleBtn.classList.add('recording');
            }
            statusEl.textContent = `Listening in ${dictationLangSelect.value === 'en-US' ? 'English' : '한국어'}...`;
        };

        recognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }

            if (finalTranscript !== '') {
                // Insert dictated text at the current cursor position in the rich editor
                if (typeof insertTextAtCursor === 'function') {
                    insertTextAtCursor(finalTranscript + ' ');
                } else {
                    // Fallback: append to end of rich editor content
                    richEditor.focus();
                    document.execCommand('insertText', false, finalTranscript + ' ');
                }

                updateWordCount();
                statusEl.textContent = 'Text dictated successfully.';

                // Triggers auto-save debouncer sequence asynchronously
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(autoSave, 5000);
            }
        };

        recognition.onerror = (event) => {
            console.log("Speech Engine Error Caught:", event.error);
            if (event.error === 'no-speech') return; // Silence closures are handled safely by onend

            if (event.error === 'not-allowed') {
                statusEl.textContent = "Mic access blocked. Check your machine permissions settings.";
                stopDictation();
            }
        };

        // SELF-HEALING STABILIZER LOOP: Restarts hardware capture if silence forces window closing
        recognition.onend = () => {
            if (isDictating) {
                setTimeout(() => {
                    if (isDictating) {
                        try { recognition.start(); } catch (e) { console.log("Auto-restart collision prevented safely."); }
                    }
                }, 400); // 400ms platform clearance buffer window
            }
        };
    }

    function startDictation() {
        if (!recognition) return;
        recognition.lang = dictationLangSelect.value;
        try {
            recognition.start();
        } catch (err) {
            console.log("Bypassed simultaneous collision:", err);
            isDictating = true;
            dictationToggleBtn.textContent = "🛑 Stop Listening";
            dictationToggleBtn.classList.add('recording');
        }
    }

    function stopDictation() {
        isDictating = false;
        if (recognition) { try { recognition.stop(); } catch (e) {} }
        if (dictationToggleBtn) {
            dictationToggleBtn.textContent = "🎙️ Start Dictation";
            dictationToggleBtn.classList.remove('recording');
        }
        statusEl.textContent = "Dictation stopped.";
    }

    if (dictationToggleBtn) {
        dictationToggleBtn.addEventListener('click', () => {
            if (!isDictating) startDictation(); else stopDictation();
        });
    }

    if (dictationLangSelect) {
        dictationLangSelect.addEventListener('change', () => {
            if (isDictating) { stopDictation(); setTimeout(startDictation, 300); }
        });
    }

    /**
     * === PERSISTENT THEME SHIFT CONTROLLER ===
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
     * === FAVORITE BUTTONS CONTROLLER ===
     */
    favoriteBtn?.addEventListener('click', () => {
        const content = getRichEditorContent();

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

        setRichEditorContent(favorite);
        updateWordCount();
        statusEl.textContent = '⭐ Favorite note loaded';
    });

    /**
     * === REAL-TIME NOTE LIST RENDERER ===
     * (filters out trashed notes; non-trashed notes only)
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
            if (note.isTrashed) return false; // exclude trashed notes from main list

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

            // Note Deletion Flow — SOFT DELETE (moves to Trash, from latest-amit-roy)
            const delBtn = div.querySelector('.delete-btn');
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const result = await window.electronAPI.newNote();
                if (result.confirmed) {
                    await window.electronAPI.saveJSONNote({
                        id: note.id,
                        isTrashed: true,
                        updatedAt: new Date().toISOString()
                    });

                    if (currentNoteId === note.id) {
                        currentNoteId = null;
                        clearRichEditor();
                        lastSavedText = '';
                        noteCategorySelect.value = 'none';
                        statusEl.textContent = 'Moved to Trash.';
                        updateWordCount();
                    } else {
                        statusEl.textContent = 'Moved to Trash.';
                    }

                    await renderNotes(searchBar.value, categoryFilter.value);
                    await renderTrash();
                }
            });

            noteList.appendChild(div);
        });

        console.log('✅ renderNotes completed:', filteredNotes.length, 'notes displayed');
    }

    /**
     * === TRASH PANEL RENDERER (from latest-amit-roy) ===
     */
    async function renderTrash() {
        if (!trashPanel || !trashList || !trashCountEl) return;
        const notesArray = await window.electronAPI.getNotes();
        const trashedNotes = notesArray.filter(note => note.isTrashed);
        trashCountEl.textContent = `${trashedNotes.length} item${trashedNotes.length === 1 ? '' : 's'}`;
        trashList.innerHTML = '';

        if (trashedNotes.length === 0) {
            trashList.innerHTML = `<p style="font-size:12px;color:gray;">Trash is empty.</p>`;
            return;
        }

        trashedNotes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        trashedNotes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'trash-item';
            item.innerHTML = `
                <div>
                    <div class="trash-item-title">${note.title || 'Untitled Note'}</div>
                    <div style="font-size:11px;color:#666;margin-top:4px;">${new Date(note.updatedAt).toLocaleString()}</div>
                </div>
                <div class="trash-item-actions">
                    <button class="restore">Restore</button>
                    <button class="delete">Delete</button>
                </div>
            `;
            item.querySelector('.restore').addEventListener('click', async () => {
                await window.electronAPI.saveJSONNote({ ...note, isTrashed: false, updatedAt: new Date().toISOString() });
                statusEl.textContent = 'Note restored from Trash.';
                await renderNotes(searchBar.value, categoryFilter.value);
                await renderTrash();
            });
            item.querySelector('.delete').addEventListener('click', async () => {
                if ((await window.electronAPI.newNote()).confirmed) {
                    await window.electronAPI.deleteNote(note.id); // permanent / hard delete
                    statusEl.textContent = 'Note permanently deleted.';
                    await renderTrash();
                }
            });
            trashList.appendChild(item);
        });
    }

    if (trashToggleBtn) {
        trashToggleBtn.addEventListener('click', async () => {
            trashPanel.classList.toggle('visible');
            if (trashPanel.classList.contains('visible')) {
                await renderTrash();
            }
        });
    }

    const emptyTrashBtn = document.getElementById('empty-trash');
    if (emptyTrashBtn) {
        emptyTrashBtn.addEventListener('click', async () => {
            const notesArray = await window.electronAPI.getNotes();
            const trashedNotes = notesArray.filter(note => note.isTrashed);
            if (trashedNotes.length === 0) return;
            if ((await window.electronAPI.newNote()).confirmed) {
                await Promise.all(trashedNotes.map(note => window.electronAPI.deleteNote(note.id)));
                statusEl.textContent = 'Trash emptied.';
                await renderTrash();
            }
        });
    }

    // --- ATTACH SEARCH INPUT AND CATEGORY FILTER EVENT LISTENERS ---
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

    /**
     * === EXPORT TO PDF BUTTON HANDLER ===
     */
    const exportPdfBtn = document.getElementById('export-pdf');
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', async () => {
            try {
                const noteTitle = getRichEditorPlainText().trim().split('\n')[0].substring(0, 50) || 'Untitled Note';
                const noteContent = getRichEditorPlainText();

                if (!noteContent.trim()) {
                    alert('Please write a note first before exporting to PDF!');
                    return;
                }

                statusEl.textContent = 'Exporting to PDF...';
                const result = await window.electronAPI.exportPdf(noteTitle, noteContent);

                if (result.success) {
                    statusEl.textContent = `✅ PDF exported to Documents: ${noteTitle}.pdf`;
                    console.log('✅ PDF exported:', result.filePath);
                } else {
                    statusEl.textContent = `❌ PDF export failed: ${result.error}`;
                    console.error('❌ PDF export error:', result.error);
                }
            } catch (error) {
                statusEl.textContent = '❌ Error exporting PDF';
                console.error('❌ Error exporting PDF:', error);
            }
        });
    }

    // --- APP PLATFORM SYSTEM MENUBAR SYNC ROUTINES ---
    window.electronAPI.onMenuAction('menu-new-note', () => { newNoteBtn.click(); });
    window.electronAPI.onMenuAction('menu-open-file', () => { openBtn.click(); });
    window.electronAPI.onMenuAction('menu-save', () => { saveBtn.click(); });
    window.electronAPI.onMenuAction('menu-save-as', () => { saveAsBtn.click(); });

    /**
     * === CORE UI CONTROL ACTION CLICKS ===
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
     * === AUTOMATED BACKSTAGE AUTO-SAVE DEBOUNCER SYSTEM ===
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
     * === ACCESSIBILITY FONT SIZE HOOKS ===
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
     * === INITIAL HYDRATION BOOT ===
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
