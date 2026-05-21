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

    let currentNoteId = null;
    let lastSavedText = '';
    let currentFontSize = 16;

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

    async function renderNotes() {
        const notesArray = await window.electronAPI.getNotes();
        noteList.innerHTML = '';

        if (notesArray.length === 0) {
            noteList.innerHTML = `<p style="font-size:12px;color:gray;padding:10px;">No saved notes.</p>`;
            return;
        }

        notesArray.forEach(note => {
            const div = document.createElement('div');
            div.className = 'note-item';
            if (note.id === currentNoteId) {
                div.className += ' active';
            }

            div.innerHTML = `
                <strong>${note.title || 'Untitled'}</strong>
                <button class="delete-btn" data-id="${note.id}">X</button>
                <br>
                <small>${new Date(note.updatedAt).toLocaleString()}</small>
            `;

            div.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-btn')) return;
                currentNoteId = note.id;
                textarea.value = note.content;
                lastSavedText = note.content;
                updateWordCount();
                renderNotes();
            });

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
                        updateWordCount();
                    }
                    renderNotes();
                }
            });

            noteList.appendChild(div);
        });
    }

    window.electronAPI.onMenuAction('menu-new-note', () => { newNoteBtn.click(); });
    window.electronAPI.onMenuAction('menu-open-file', () => { openBtn.click(); });
    window.electronAPI.onMenuAction('menu-save', () => { saveBtn.click(); });
    window.electronAPI.onMenuAction('menu-save-as', () => { saveAsBtn.click(); });

    saveBtn.addEventListener('click', async () => {
        const text = textarea.value;
        if (!currentNoteId) {
            currentNoteId = Date.now().toString();
        }

        await window.electronAPI.saveNote(text, currentNoteId);

        const noteObject = {
            id: currentNoteId,
            title: text.substring(0, 20) || 'Untitled Note',
            content: text,
            updatedAt: new Date().toISOString()
        };

        await window.electronAPI.saveJSONNote(noteObject);
        lastSavedText = text;
        statusEl.textContent = 'Note saved successfully (TXT & JSON)';
        alert('Note saved successfully');
        await renderNotes();
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
                updatedAt: new Date().toISOString()
            };
            await window.electronAPI.saveJSONNote(noteObject);
            lastSavedText = textarea.value;
            statusEl.textContent = `Saved as: ${fileName}`;
            await renderNotes();
        }
    });

    newNoteBtn.addEventListener('click', async () => {
        if (textarea.value !== lastSavedText) {
            const result = await window.electronAPI.newNote();
            if (!result.confirmed) return;
        }
        textarea.value = '';
        lastSavedText = '';
        currentNoteId = Date.now().toString();
        statusEl.textContent = 'New note started.';
        updateWordCount();
        await renderNotes();
    });

    openBtn.addEventListener('click', async () => {
        const result = await window.electronAPI.openFile();
        if (result.success) {
            textarea.value = result.content;
            lastSavedText = result.content;
            currentNoteId = result.filePath;
            statusEl.textContent = `Opened: ${result.filePath}`;
            updateWordCount();
            await renderNotes();
        }
    });

    async function autoSave() {
        if (textarea.value === lastSavedText) return;
        try {
            if (!currentNoteId) currentNoteId = Date.now().toString();
            await window.electronAPI.saveNote(textarea.value, currentNoteId);

            const noteObject = {
                id: currentNoteId,
                title: textarea.value.substring(0, 20) || 'Untitled Note',
                content: textarea.value,
                updatedAt: new Date().toISOString()
            };

            await window.electronAPI.saveJSONNote(noteObject);
            lastSavedText = textarea.value;
            statusEl.textContent = `Auto-saved at ${new Date().toLocaleTimeString()}`;
            await renderNotes();
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

    fontIncreaseBtn.addEventListener('click', async () => {
        applyFontSize(currentFontSize + 2);
        await window.electronAPI.saveSettings({ fontSize: currentFontSize });
    });

    fontDecreaseBtn.addEventListener('click', async () => {
        applyFontSize(currentFontSize - 2);
        await window.electronAPI.saveSettings({ fontSize: currentFontSize });
    });

    const settings = await window.electronAPI.getSettings();
    applyFontSize(settings.fontSize || 16);

    const notes = await window.electronAPI.getNotes();
    if (notes.length > 0) {
        const mostRecentNote = notes.reduce((recent, current) => {
            return new Date(current.updatedAt) > new Date(recent.updatedAt) ? current : recent;
        }, notes[0]);
        currentNoteId = mostRecentNote.id;
        textarea.value = mostRecentNote.content;
        lastSavedText = mostRecentNote.content;
    } else {
        const savedNote = await window.electronAPI.loadNote();
        textarea.value = savedNote;
        lastSavedText = savedNote;
    }

    updateWordCount();
    await renderNotes();
});