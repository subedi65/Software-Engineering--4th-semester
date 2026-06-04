window.addEventListener('DOMContentLoaded', async () => {
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

    let currentNoteId = null;
    let lastSavedText = '';
    let currentFontSize = 16;

    const categoryLabels = {
        none: 'Uncategorized',
        work: '💼 Work',
        personal: '🏠 Personal',
        ideas: '💡 Ideas',
        todo: '✅ To-Do'
    };

    // --- 1. PERSISTENT THEME SHIFT CONTROLLER ---
    const savedTheme = localStorage.getItem('app-theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }

    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        if (document.body.classList.contains('dark-theme')) {
            localStorage.setItem('app-theme', 'dark');
        } else {
            localStorage.setItem('app-theme', 'light');
        }
    });

    // --- 2. TEXT COUNTERS METRICS UTILITY ---
    function updateWordCount() {
        const text = textarea.value;
        const characters = text.length;
        const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
        document.getElementById('word-count').textContent = `Words: ${words} | Characters: ${characters}`;
    }

    // --- 3. DYNAMIC TEXT AREA FONT MUTATOR ---
    function applyFontSize(size) {
        currentFontSize = Math.min(32, Math.max(10, size));
        textarea.style.fontSize = `${currentFontSize}px`;
    }

    // Central safety function to check for structural changes before discarding text
    async function confirmDiscardIfUnsaved() {
        if (textarea.value !== lastSavedText) {
            const result = await window.electronAPI.newNote();
            return result.confirmed;
        }
        return true;
    }

    // --- 4. REAL-TIME NOTE LIST RENDERER ---
    async function renderNotes(searchQuery = '', activeCategory = 'all') {
        if (document.getElementById('sidebar').style.display === 'none') return;

        const notesArray = await window.electronAPI.getNotes();
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
                textarea.value = note.content;
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
                        textarea.value = '';
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

        const updatedObject = {
            id: currentNoteId,
            category: noteCategorySelect.value,
            title: textarea.value.trim().split('\n')[0].substring(0, 20) || 'Untitled Note',
            content: textarea.value,
            isPinned: wasPinned,
            updatedAt: new Date().toISOString()
        };

        await window.electronAPI.saveJSONNote(updatedObject);
        statusEl.textContent = `Category updated to: ${noteCategorySelect.value}`;
        await renderNotes(searchBar.value, categoryFilter.value);
    });

    // --- 6. APP PLATFORM SYSTEM MENUBAR SYNC ROUTINES ---
    window.electronAPI.onMenuAction('menu-new-note', () => { newNoteBtn.click(); });
    window.electronAPI.onMenuAction('menu-open-file', () => { openBtn.click(); });
    window.electronAPI.onMenuAction('menu-save', () => { saveBtn.click(); });
    window.electronAPI.onMenuAction('menu-save-as', () => { saveAsBtn.click(); });

    // --- 7. CORE UI CONTROL ACTION CLICKS ---

    saveBtn.addEventListener('click', async () => {
        const text = textarea.value;
        if (!currentNoteId) {
            currentNoteId = Date.now().toString();
        }

        await window.electronAPI.saveNote(text, null);

        const notesListCurrent = await window.electronAPI.getNotes();
        const existingNote = notesListCurrent.find(n => n.id === currentNoteId);
        const wasPinned = existingNote ? existingNote.isPinned : false;

        const noteObject = {
            id: currentNoteId,
            title: text.trim().split('\n')[0].substring(0, 20) || 'Untitled Note',
            content: text,
            isPinned: wasPinned,
            category: noteCategorySelect.value,
            updatedAt: new Date().toISOString()
        };

        await window.electronAPI.saveJSONNote(noteObject);
        lastSavedText = text;
        statusEl.textContent = 'Note saved successfully (TXT & JSON)';
        await renderNotes(searchBar.value, categoryFilter.value);
    });

    saveAsBtn.addEventListener('click', async () => {
        const result = await window.electronAPI.saveNoteAs(textarea.value);
        if (result.success) {
            currentNoteId = result.filePath;
            const fileName = result.filePath.split('\\').pop().split('/').pop();
            const noteObject = {
                id: result.filePath,
                title: fileName,
                content: textarea.value,
                isPinned: false,
                category: noteCategorySelect.value,
                updatedAt: new Date().toISOString()
            };
            await window.electronAPI.saveJSONNote(noteObject);
            lastSavedText = textarea.value;
            statusEl.textContent = `Saved as: ${fileName}`;
            await renderNotes(searchBar.value, categoryFilter.value);
        }
    });

    newNoteBtn.addEventListener('click', async () => {
        const allowed = await confirmDiscardIfUnsaved();
        if (!allowed) return;

        textarea.value = '';
        lastSavedText = '';
        currentNoteId = Date.now().toString();
        noteCategorySelect.value = 'none';
        statusEl.textContent = 'New blank note initialized.';
        updateWordCount();
        await renderNotes(searchBar.value, categoryFilter.value);
    });

    openBtn.addEventListener('click', async () => {
        const allowed = await confirmDiscardIfUnsaved();
        if (!allowed) return;

        const result = await window.electronAPI.openFile();
        if (result.success) {
            textarea.value = result.content;
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
        }
    });

    // --- 8. AUTOMATED BACKSTAGE AUTO-SAVE DEBOUNCER SYSTEM ---
    async function autoSave() {
        if (textarea.value === lastSavedText) return;
        try {
            if (!currentNoteId) currentNoteId = Date.now().toString();
            await window.electronAPI.saveNote(textarea.value, null);

            const notesListCurrent = await window.electronAPI.getNotes();
            const existingNote = notesListCurrent.find(n => n.id === currentNoteId);
            const wasPinned = existingNote ? existingNote.isPinned : false;

            const noteObject = {
                id: currentNoteId,
                title: textarea.value.trim().split('\n')[0].substring(0, 20) || 'Untitled Note',
                content: textarea.value,
                isPinned: wasPinned,
                category: noteCategorySelect.value,
                updatedAt: new Date().toISOString()
            };

            await window.electronAPI.saveJSONNote(noteObject);
            lastSavedText = textarea.value;
            statusEl.textContent = `Auto-saved at ${new Date().toLocaleTimeString()}`;
            await renderNotes(searchBar.value, categoryFilter.value);
        } catch (err) {
            statusEl.textContent = 'Auto-save failed';
        }
    }

    let debounceTimer;
    textarea.addEventListener('input', () => {
        statusEl.textContent = 'Changes detected...';
        updateWordCount();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(autoSave, 5000); 
    });

    // --- 9. ACCESSIBILITY FONT SIZE HOOKS ---
    fontIncreaseBtn.addEventListener('click', async () => {
        applyFontSize(currentFontSize + 2);
        await window.electronAPI.saveSettings({ fontSize: currentFontSize });
    });

    fontDecreaseBtn.addEventListener('click', async () => {
        applyFontSize(currentFontSize - 2);
        await window.electronAPI.saveSettings({ fontSize: currentFontSize });
    });

    // --- 10. DETACHED POP-OUT ROUTINES & DATA INITIAL HYDRATION BOOT ---
    const settings = await window.electronAPI.getSettings();
    applyFontSize(settings.fontSize || 16);

    const popoutNoteData = await window.electronAPI.getPopoutData();

    if (popoutNoteData) {
        document.getElementById('sidebar').style.display = 'none';
        document.querySelector('.category-selector-container').style.display = 'none';
        document.getElementById('new-note').style.display = 'none';
        
        currentNoteId = popoutNoteData.id;
        textarea.value = popoutNoteData.content;
        lastSavedText = popoutNoteData.content;
        
        statusEl.textContent = `Detached View: ${popoutNoteData.title || 'Note'}`;
    } else {
        const notes = await window.electronAPI.getNotes();
        if (notes.length > 0) {
            const mostRecentNote = notes.reduce((recent, current) => {
                return new Date(current.updatedAt) > new Date(recent.updatedAt) ? current : recent;
            }, notes[0]);
            currentNoteId = mostRecentNote.id;
            textarea.value = mostRecentNote.content;
            lastSavedText = mostRecentNote.content;
            noteCategorySelect.value = mostRecentNote.category || 'none';
        } else {
            const savedNote = await window.electronAPI.loadNote();
            textarea.value = savedNote;
            lastSavedText = savedNote;
            noteCategorySelect.value = 'none';
        }
    }

    updateWordCount();
    await renderNotes('', 'all'); 
});