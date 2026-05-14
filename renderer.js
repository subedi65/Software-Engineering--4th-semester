window.addEventListener('DOMContentLoaded', async () => {
    const textarea = document.getElementById('note');
    const saveBtn = document.getElementById('save');
    const statusEl = document.getElementById('save_status');
    const saveAsBtn = document.getElementById('save-as');
    const newNoteBtn = document.getElementById('new-note');
    const openBtn = document.getElementById('open-file');

    let currentFilePath = null;

    const noteList = document.getElementById('note-list');

    const notes = await window.electronAPI.getNotes();

    function renderNotes(notesArray) {

        noteList.innerHTML = '';

        if (notesArray.length === 0) {
            noteList.innerHTML = `
                <p style="font-size:12px;color:gray;">
                    No saved notes.
                </p>
            `;
            return;
        }

        notesArray.forEach(note => {

            const div = document.createElement('div');

            div.className = 'note-item';

            div.innerHTML = `
                <strong>${note.title || 'Untitled'}</strong>
                <br>
                <small>
                    ${new Date(note.updatedAt).toLocaleString()}
                </small>
            `;

            div.addEventListener('click', () => {
                textarea.value = note.content;
                currentFilePath = note.id;
                lastSavedText = note.content;
            });

            noteList.appendChild(div);
        });
    }

    renderNotes(notes);

    if (notes.length > 0) {
        textarea.value = notes[notes.length - 1].content;
    } else {
        const savedNote = await window.electronAPI.loadNote();
        textarea.value = savedNote;
    }

    let lastSavedText = textarea.value;

    window.electronAPI.onMenuAction('menu-new-note', () => {
        newNoteBtn.click();
    });

    window.electronAPI.onMenuAction('menu-open-file', () => {
        openBtn.click();
    });

    window.electronAPI.onMenuAction('menu-save', () => {
        saveBtn.click();
    });

    window.electronAPI.onMenuAction('menu-save-as', () => {
        saveAsBtn.click();
    });

    saveBtn.addEventListener('click', async () => {
        const text = textarea.value;

        await window.electronAPI.saveNote(text, currentFilePath);

        const noteObject = {
            id: currentFilePath || Date.now().toString(),
            title: text.substring(0, 20) || 'Untitled Note',
            content: text,
            updatedAt: new Date().toISOString()
        };

        await window.electronAPI.saveJSONNote(noteObject);

        renderNotes(await window.electronAPI.getNotes());

        lastSavedText = text;

        statusEl.textContent = 'Note saved successfully (TXT & JSON)';

        alert('Note saved successfully');
    });

    saveAsBtn.addEventListener('click', async () => {

    const result = await window.electronAPI.saveNoteAs(textarea.value);

    if (result.success) {

        currentFilePath = result.filePath;

        const fileName = result.filePath
            .split('\\')
            .pop()
            .split('/')
            .pop();

        const noteObject = {
            id: result.filePath,
            title: fileName,
            content: textarea.value,
            updatedAt: new Date().toISOString()
        };
        await window.electronAPI.saveJSONNote(noteObject);
        renderNotes(await window.electronAPI.getNotes());
        lastSavedText = textarea.value;
        statusEl.textContent = `Saved as: ${fileName}`;
    }
});

    newNoteBtn.addEventListener('click', async () => {
        if (textarea.value !== lastSavedText) {
            const result = await window.electronAPI.newNote();

            if (!result.confirmed) {
                return;
            }
        }

        textarea.value = '';
        lastSavedText = '';
        currentFilePath = null;

        statusEl.textContent = 'New note started.';
    });

    openBtn.addEventListener('click', async () => {
        const result = await window.electronAPI.openFile();

        if (result.success) {
            textarea.value = result.content;
            lastSavedText = result.content;
            currentFilePath = result.filePath;
            statusEl.textContent = `Opened: ${result.filePath}`;
        }
    });

    async function autoSave() {
        if (textarea.value === lastSavedText) {
            return;
        }

        try {
            await window.electronAPI.saveNote(textarea.value, currentFilePath);

            const noteObject = {
                id: currentFilePath || 'autosave-note',
                content: textarea.value,
                updatedAt: new Date().toISOString()
            };

            await window.electronAPI.saveJSONNote(noteObject);

            renderNotes(await window.electronAPI.getNotes());

            lastSavedText = textarea.value;

            statusEl.textContent = `Auto-saved at ${new Date().toLocaleTimeString()}`;
        } catch (err) {
            statusEl.textContent = 'Auto-save failed';
        }
    }

    let debounceTimer;

    textarea.addEventListener('input', () => {
        statusEl.textContent = 'Changes detected...';

        clearTimeout(debounceTimer);

        debounceTimer = setTimeout(autoSave, 5000);
    });
});