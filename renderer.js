 window.addEventListener('DOMContentLoaded', async () => {
    // 1. CORE DOM LAYOUT EXTRACTION TARGETS
    const textarea = document.getElementById('note');
    const saveBtn = document.getElementById('save');
    const statusEl = document.getElementById('save_status');
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
    const trashToggleBtn = document.getElementById('trash-toggle');
    const trashPanel = document.getElementById('trash-panel');
    const trashList = document.getElementById('trash-list');
    const trashCountEl = document.getElementById('trash-count');

    // Voice Elements Registration
    const dictationToggleBtn = document.getElementById('dictation-toggle');
    const dictationLangSelect = document.getElementById('dictation-lang');

    // 2. GLOBAL CONTROLLER STATE VARIABLES (Pre-declared at top to prevent crash errors)
    let currentNoteId = null;
    let lastSavedText = '';
    let currentFontSize = 16;
    let isDictating = false;
    let recognition = null;
    let debounceTimer = null; 

    const categoryLabels = { none: 'Uncategorized', work: '💼 Work', personal: '🏠 Personal', ideas: '💡 Ideas', todo: '✅ To-Do' };

    function updateWordCount() {
        const text = textarea.value;
        const characters = text.length;
        const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
        document.getElementById('word-count').textContent = `Words: ${words} | Characters: ${characters}`;
    }

    function applyFontSize(size) {
        currentFontSize = Math.min(32, Math.max(10, size));
        textarea.style.fontSize = `${currentFontSize}px`;
    }

    async function confirmDiscardIfUnsaved() {
        if (textarea.value !== lastSavedText) {
            const result = await window.electronAPI.newNote();
            return result.confirmed;
        }
        return true;
    }

    // ==========================================
    // 3. SECURE SPEECH DICTATION RECOGNITION PIPELINE
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
        recognition.interimResults = false; // CRITICAL CHANNELS FIX: Blocks fragmented inputs from triggering collision crashes

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
                // Focus-aware text insertion maps speech string right at active cursor coordinates
                const startPos = textarea.selectionStart;
                const endPos = textarea.selectionEnd;
                const text = textarea.value;

                textarea.value = text.substring(0, startPos) + finalTranscript + " " + text.substring(endPos);
                textarea.selectionStart = textarea.selectionEnd = startPos + finalTranscript.length + 1;

                updateWordCount();
                statusEl.textContent = 'Text dictated successfully.';
                
                // Triggers native auto-save debouncer sequence asynchronously
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
                        try { recognition.start(); } catch(e) { console.log("Auto-restart collision prevented safely."); }
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
        if (recognition) { try { recognition.stop(); } catch(e) {} }
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

    // 4. THEME SHIFT CONTROLLER
    const savedTheme = localStorage.getItem('app-theme') || 'light';
    if (savedTheme === 'dark') document.body.classList.add('dark-theme');

    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        localStorage.setItem('app-theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
    });

    // 5. SIDEBAR NOTES LIST RENDER ENGINE
    async function renderNotes(searchQuery = '', activeCategory = 'all') {
        const sidebarEl = document.getElementById('sidebar');
        if (!sidebarEl || sidebarEl.style.display === 'none') return;

        const notesArray = await window.electronAPI.getNotes();
        noteList.innerHTML = '';
        const query = searchQuery.trim().toLowerCase();

        const filteredNotes = notesArray.filter(note => {
            if (note.isTrashed) return false;
            const matchesText = (note.title || '').toLowerCase().includes(query) || (note.content || '').toLowerCase().includes(query);
            return matchesText && (activeCategory === 'all' || (note.category || 'none') === activeCategory);
        });

        if (filteredNotes.length === 0) {
            noteList.innerHTML = `<p style="font-size:12px;color:gray;padding:10px;">No matching notes found.</p>`;
            return;
        }

        filteredNotes.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.updatedAt) - new Date(a.updatedAt));

        filteredNotes.forEach(note => {
            const div = document.createElement('div');
            div.className = 'note-item' + (note.id === currentNoteId ? ' active' : '') + (note.isPinned ? ' pinned' : '');
            const catKey = note.category || 'none';

            div.innerHTML = `
                <strong>${note.title || 'Untitled Note'}</strong>
                <div class="note-actions">
                    <button class="popout-btn" title="Open in separate window">🗔</button>
                    <button class="pin-btn" title="Pin Note">📌</button>
                    <button class="delete-btn" data-id="${note.id}">❌</button>
                </div>
                <br>
                <span class="category-badge badge-${catKey}">${categoryLabels[catKey]}</span>
                <br>
                <small style="display:inline-block; margin-top:4px;">${new Date(note.updatedAt).toLocaleString()}</small>
            `;

            div.querySelector('.popout-btn').addEventListener('click', (e) => { e.stopPropagation(); window.electronAPI.openSeparateWindow(note); });
            div.querySelector('.pin-btn').addEventListener('click', async (e) => {
                e.stopPropagation(); note.isPinned = !note.isPinned;
                await window.electronAPI.saveJSONNote({ id: note.id, isPinned: note.isPinned, updatedAt: new Date().toISOString() });
                renderNotes(searchBar.value, categoryFilter.value);
            });

            div.addEventListener('click', async (e) => {
                if (e.target.closest('.note-actions') || note.id === currentNoteId) return;
                if (!await confirmDiscardIfUnsaved()) return;
                currentNoteId = note.id; textarea.value = note.content; lastSavedText = note.content;
                noteCategorySelect.value = note.category || 'none'; statusEl.textContent = 'Note loaded.'; updateWordCount();
                renderNotes(searchBar.value, categoryFilter.value);
            });

            div.querySelector('.delete-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                if ((await window.electronAPI.newNote()).confirmed) {
                    await window.electronAPI.saveJSONNote({ id: note.id, isTrashed: true, updatedAt: new Date().toISOString() });
                    if (currentNoteId === note.id) { currentNoteId = null; textarea.value = ''; lastSavedText = ''; noteCategorySelect.value = 'none'; updateWordCount(); }
                    statusEl.textContent = 'Moved to Trash.';
                    await renderNotes(searchBar.value, categoryFilter.value);
                    await renderTrash();
                }
            });
            noteList.appendChild(div);
        });
    }

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
                    await window.electronAPI.deleteNote(note.id);
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

    searchBar.addEventListener('input', () => { renderNotes(searchBar.value, categoryFilter.value); });
    categoryFilter.addEventListener('change', () => { renderNotes(searchBar.value, categoryFilter.value); });

    noteCategorySelect.addEventListener('change', async () => {
        if (!currentNoteId) return;
        const notesListCurrent = await window.electronAPI.getNotes();
        const existingNote = notesListCurrent.find(n => n.id === currentNoteId);
        await window.electronAPI.saveJSONNote({
            id: currentNoteId, category: noteCategorySelect.value, title: textarea.value.trim().split('\n')[0].substring(0, 20) || 'Untitled Note',
            content: textarea.value, isPinned: existingNote ? existingNote.isPinned : false, updatedAt: new Date().toISOString()
        });
        statusEl.textContent = `Tag updated: ${noteCategorySelect.value}`; renderNotes(searchBar.value, categoryFilter.value);
    });

    // 6. DISK FILE PERSISTENCE MANUAL CLICKS
    saveBtn.addEventListener('click', async () => {
        const text = textarea.value; if (!currentNoteId) currentNoteId = Date.now().toString();
        await window.electronAPI.saveNote(text, null);
        const notesListCurrent = await window.electronAPI.getNotes();
        const existingNote = notesListCurrent.find(n => n.id === currentNoteId);
        await window.electronAPI.saveJSONNote({ id: currentNoteId, title: text.trim().split('\n')[0].substring(0, 20) || 'Untitled Note', content: text, isPinned: existingNote ? existingNote.isPinned : false, category: noteCategorySelect.value, updatedAt: new Date().toISOString() });
        lastSavedText = text; statusEl.textContent = 'Note saved successfully.'; renderNotes(searchBar.value, categoryFilter.value);
    });

    saveAsBtn.addEventListener('click', async () => {
        const result = await window.electronAPI.saveNoteAs(textarea.value);
        if (result.success) {
            currentNoteId = result.filePath; const fileName = result.filePath.split('\\').pop().split('/').pop();
            await window.electronAPI.saveJSONNote({ id: result.filePath, title: fileName, content: textarea.value, isPinned: false, category: noteCategorySelect.value, updatedAt: new Date().toISOString() });
            lastSavedText = textarea.value; statusEl.textContent = `Saved file: ${fileName}`; renderNotes(searchBar.value, categoryFilter.value);
        }
    });

    newNoteBtn.addEventListener('click', async () => {
        if (!await confirmDiscardIfUnsaved()) return;
        textarea.value = ''; lastSavedText = ''; currentNoteId = Date.now().toString(); noteCategorySelect.value = 'none';
        statusEl.textContent = 'New note canvas ready.'; updateWordCount(); renderNotes(searchBar.value, categoryFilter.value);
    });

    openBtn.addEventListener('click', async () => {
        if (!await confirmDiscardIfUnsaved()) return;
        const result = await window.electronAPI.openFile();
        if (result.success) {
            textarea.value = result.content; lastSavedText = result.content; currentNoteId = result.filePath; noteCategorySelect.value = 'none';
            const fileName = result.filePath.split('\\').pop().split('/').pop();
            await window.electronAPI.saveJSONNote({ id: result.filePath, title: fileName, content: result.content, isPinned: false, category: 'none', updatedAt: new Date().toISOString() });
            statusEl.textContent = `Opened file: ${result.filePath}`; updateWordCount(); renderNotes(searchBar.value, categoryFilter.value);
        }
    });

    // AUTOMATED AUTO-SAVE LOOP
    async function autoSave() {
        if (textarea.value === lastSavedText) return;
        try {
            if (!currentNoteId) currentNoteId = Date.now().toString();
            await window.electronAPI.saveNote(textarea.value, null);
            const notesListCurrent = await window.electronAPI.getNotes();
            const existingNote = notesListCurrent.find(n => n.id === currentNoteId);
            await window.electronAPI.saveJSONNote({ id: currentNoteId, title: textarea.value.trim().split('\n')[0].substring(0, 20) || 'Untitled Note', content: textarea.value, isPinned: existingNote ? existingNote.isPinned : false, category: noteCategorySelect.value, updatedAt: new Date().toISOString() });
            lastSavedText = textarea.value; statusEl.textContent = `Auto-saved at ${new Date().toLocaleTimeString()}`; renderNotes(searchBar.value, categoryFilter.value);
        } catch (err) { statusEl.textContent = 'Auto-save failed'; }
    }

    textarea.addEventListener('input', () => {
        statusEl.textContent = 'Modifications detected...'; updateWordCount();
        clearTimeout(debounceTimer); debounceTimer = setTimeout(autoSave, 5000); 
    });

    fontIncreaseBtn.addEventListener('click', async () => { applyFontSize(currentFontSize + 2); await window.electronAPI.saveSettings({ fontSize: currentFontSize }); });
    fontDecreaseBtn.addEventListener('click', async () => { applyFontSize(currentFontSize - 2); await window.electronAPI.saveSettings({ fontSize: currentFontSize }); });

    window.electronAPI.onMenuAction('menu-new-note', () => { newNoteBtn.click(); });
    window.electronAPI.onMenuAction('menu-open-file', () => { openBtn.click(); });
    window.electronAPI.onMenuAction('menu-save', () => { saveBtn.click(); });
    window.electronAPI.onMenuAction('menu-save-as', () => { saveAsBtn.click(); });

    // 7. DEPLOYMENT INITIAL HYDRATION BOOT
    const settings = await window.electronAPI.getSettings();
    applyFontSize(settings.fontSize || 16);

    const popoutNoteData = await window.electronAPI.getPopoutData();
    if (popoutNoteData) {
        if (document.getElementById('sidebar')) document.getElementById('sidebar').style.display = 'none';
        if (document.querySelector('.category-selector-container')) document.querySelector('.category-selector-container').style.display = 'none';
        if (newNoteBtn) newNoteBtn.style.display = 'none';
        currentNoteId = popoutNoteData.id; textarea.value = popoutNoteData.content; lastSavedText = popoutNoteData.content;
        statusEl.textContent = `Detached View: ${popoutNoteData.title || 'Note'}`;
    } else {
        const notes = await window.electronAPI.getNotes();
        if (notes && notes.length > 0) {
            const mostRecentNote = notes.reduce((recent, current) => new Date(current.updatedAt) > new Date(recent.updatedAt) ? current : recent, notes[0]);
            currentNoteId = mostRecentNote.id; textarea.value = mostRecentNote.content; lastSavedText = mostRecentNote.content; noteCategorySelect.value = mostRecentNote.category || 'none';
        } else {
            const savedNote = await window.electronAPI.loadNote(); textarea.value = savedNote || ''; lastSavedText = textarea.value; noteCategorySelect.value = 'none';
        }
    }
    updateWordCount(); await renderNotes('', 'all'); 
});