const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveNote: (text, filePath) => ipcRenderer.invoke('save-note', text, filePath),
    loadNote: () => ipcRenderer.invoke('load-note'),
    saveNoteAs: (text) => ipcRenderer.invoke('save-as', text),
    newNote: () => ipcRenderer.invoke('new-note'),
    openFile: () => ipcRenderer.invoke('open-file'),
    onMenuAction: (channel, callback) => ipcRenderer.on(channel, callback),
    getNotes: () => ipcRenderer.invoke('get-notes'),
    saveJSONNote: (note) => ipcRenderer.invoke('save-json-note', note),
    deleteNote: (id) => ipcRenderer.invoke('delete-note', id),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    openSeparateWindow: (noteObject) => ipcRenderer.send('open-separate-window', noteObject),
    getPopoutData: () => ipcRenderer.invoke('get-popout-data'),
    // Listen for the focus event from main.js
    onWindowFocused: (callback) => ipcRenderer.on('window-focused', callback),
    
    // Read the current system clipboard
    readClipboard: () => clipboard.readText()
});