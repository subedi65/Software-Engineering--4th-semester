const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveNote: (text, filePath) => ipcRenderer.invoke('save-note', text, filePath),
    loadNote: () => ipcRenderer.invoke('load-note'),
    saveNoteAs: (text) => ipcRenderer.invoke('save-as', text),
    newNote: () => ipcRenderer.invoke('new-note'),
    openFile: () => ipcRenderer.invoke('open-file')
});