window.addEventListener('DOMContentLoaded', async () => {
    const textarea = document.getElementById('note');
    const saveBtn = document.getElementById('save');
    const statusEl = document.getElementById('save_status');
    const saveAsBtn = document.getElementById('save-as');
    const newNoteBtn = document.getElementById('new-note');
    const openBtn = document.getElementById('open-file');

    let currentFilePath = null;

    // --- 1. INITIAL LOAD (JSON Storage) ---
    // Instead of loading a single .txt file, we could now fetch all JSON notes
    const notes = await window.electronAPI.getNotes();
    if (notes.length > 0) {
        // For now, let's load the most recent note from our JSON list
        textarea.value = notes[notes.length - 1].content;
    } else {
        const savedNote = await window.electronAPI.loadNote();
        textarea.value = savedNote;
    }
    let lastSavedText = textarea.value;

    // --- 2. MENU ACTION LISTENERS (NEW) ---
    // These link the native app menu clicks to your existing functions
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

    // --- 3. UPDATED BUTTON LOGIC ---

    // Save Note
    saveBtn.addEventListener('click', async () => {
        const text = textarea.value;
        
        // Save to .txt file (Existing logic)
        const result = await window.electronAPI.saveNote(text, currentFilePath);
        
        // ALSO: Save to JSON Storage (New logic from PDF)
        const noteObject = {
            id: currentFilePath || Date.now().toString(), // Use path or timestamp as ID
            title: text.substring(0, 20) || "Untitled Note",
            content: text,
            updatedAt: new Date().toISOString()
        };
        await window.electronAPI.saveJSONNote(noteObject);

        lastSavedText = text;
        statusEl.textContent = 'Note saved successfully (TXT & JSON)';
        alert('Note saved successfully');
    });

    // Save As
    saveAsBtn.addEventListener('click', async () => {
        const result = await window.electronAPI.saveNoteAs(textarea.value);
        if (result.success) {
            currentFilePath = result.filePath;
            lastSavedText = textarea.value;
            statusEl.textContent = `Saved as: ${result.filePath}`;
        }
    });

    // New Note
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

    // Open File
    openBtn.addEventListener('click', async () => {
        const result = await window.electronAPI.openFile();
        if (result.success) {
            textarea.value = result.content;
            lastSavedText = result.content;
            currentFilePath = result.filePath;
            statusEl.textContent = `Opened: ${result.filePath}`;
        }
    });

    // --- 4. AUTO-SAVE LOGIC ---
    async function autoSave() {
        if (textarea.value === lastSavedText) return;
        try {
            // Auto-save to both the current file and the JSON storage
            await window.electronAPI.saveNote(textarea.value, currentFilePath);
            
            const noteObject = {
                id: currentFilePath || 'autosave-note',
                content: textarea.value,
                updatedAt: new Date().toISOString()
            };
            await window.electronAPI.saveJSONNote(noteObject);

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