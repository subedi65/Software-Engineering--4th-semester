window.addEventListener('DOMContentLoaded', async () => {
    const textarea = document.getElementById('note');
    const saveBtn = document.getElementById('save');
    const statusEl = document.getElementById('save_status');
    const saveAsBtn = document.getElementById('save-as');
    const newNoteBtn = document.getElementById('new-note');
    const openBtn = document.getElementById('open-file');

    let currentFilePath = null;

    // Initial Load
    const savedNote = await window.electronAPI.loadNote();
    textarea.value = savedNote;
    let lastSavedText = textarea.value;

    // 1. Save Note (Smart Save Logic)
    saveBtn.addEventListener('click', async () => {
        // if (!currentFilePath) {
            const result = await window.electronAPI.saveNote(textarea.value);
        //     if (result.success) {
        //         currentFilePath = result.filePath;
        //         lastSavedText = textarea.value;
        //         statusEl.textContent = `Saved to: ${result.filePath}`;
        //     }
        // } else {
        //     await window.electronAPI.saveNote(textarea.value, currentFilePath);
        //     lastSavedText = textarea.value;
        //     statusEl.textContent = 'Saved!';
        // }
        alert('Note saved successfully')
    });

    // 2. Save As
    saveAsBtn.addEventListener('click', async () => {
        const result = await window.electronAPI.saveNoteAs(textarea.value);
        if (result.success) {
            currentFilePath = result.filePath;
            lastSavedText = textarea.value;
            statusEl.textContent = `Saved as: ${result.filePath}`;
        }
    });

    // 3. New Note
    newNoteBtn.addEventListener('click', async () => {
        if (textarea.value !== lastSavedText) {
            const result = await window.electronAPI.newNote();
            if (!result.confirmed) return;
        }
        textarea.value = '';
        lastSavedText = '';
        currentFilePath = null;
        statusEl.textContent = 'New note started.';
    });

    // 4. Open File
    openBtn.addEventListener('click', async () => {
        const result = await window.electronAPI.openFile();
        if (result.success) {
            textarea.value = result.content;
            lastSavedText = result.content;
            currentFilePath = result.filePath;
            statusEl.textContent = `Opened: ${result.filePath}`;
        }
    });

    // Auto-save logic
    async function autoSave() {
        if (textarea.value === lastSavedText) return;
        try {
            await window.electronAPI.saveNote(textarea.value, currentFilePath);
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