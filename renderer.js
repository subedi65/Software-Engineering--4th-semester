
const textarea = document.getElementById('note');

window.addEventListener('DOMContentLoaded', async () => {
    const saveButton = document.getElementById('save');
    const statusEl = document.getElementById('save_status');
    const saveAsButton = document.getElementById('saveAs');

    // load saved note on startup
    const savedNote = await window.electronAPI.loadNote();
    textarea.value = savedNote;

    // track initial saved contents
    let lastSavedText = textarea.value;

    // Manual save note
    saveButton.addEventListener('click', async () => {
        try {
            await window.electronAPI.saveNote(textarea.value);
            lastSavedText = textarea.value;

            alert('Note saved successfully!');
            if (statusEl) statusEl.textContent = 'Manual save successful!';
        } catch (err) {
            console.error('Error saving note:', err);
            if (statusEl) statusEl.textContent = 'Error saving note';
        }
    });

});
saveAsButton.addEventListener('click', async () => {
    const result = await window.electronAPI.saveAs(textarea.value);
    if (result.success) {
        lastSavedText = textarea.value;
        statusEl.textContent = `Note saved as ${result.filepath}`;
    } else {
        statusEl.textContent = 'Save As cancelled';
    }
});

let debounceTimer;
async function autosave() {
    const currentText = textarea.value;
    if (currentText === lastSavedText) {
        if (statusEl) statusEl.textContent = 'no changes -already saved';
        return;
    }
    try {
        await window.electronAPI.saveNote(currentText);
        lastSavedText = currentText;
        const now = new Date().toLocaleTimeString();
         statusEl.textContent = `Auto_ saved at ${now}`;
    } catch (err) {
        console.error("Error auto-saving note:", err);
         statusEl.textContent = "Error auto-saving note";
    }
}
