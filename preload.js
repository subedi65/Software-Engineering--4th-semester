const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Existing .txt based methods
    saveNote: (text, filePath) => ipcRenderer.invoke('save-note', text, filePath),
    loadNote: () => ipcRenderer.invoke('load-note'),
    saveNoteAs: (text) => ipcRenderer.invoke('save-as', text),
    newNote: () => ipcRenderer.invoke('new-note'),
    openFile: () => ipcRenderer.invoke('open-file'),

    // NEW: App Menu Action Listener
    // This allows renderer.js to listen for messages sent from main.js menu clicks
    onMenuAction: (channel, callback) => ipcRenderer.on(channel, callback),

    // NEW: JSON Storage Methods for Multiple Notes [cite: 72]
    getNotes: () => ipcRenderer.invoke('get-notes'),
    saveJSONNote: (note) => ipcRenderer.invoke('save-json-note', note),
    deleteNote: (id) => ipcRenderer.invoke('delete-note', id)
});