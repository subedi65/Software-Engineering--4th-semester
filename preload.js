const { contextBridge, ipcRenderer } = require('electron');

// Expose only the methods we need to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Note Operations
     */
    // Save note to TXT file (for backup/export)
    saveNote: (text, filePath) => ipcRenderer.invoke('save-note', text, filePath),

    // Load default note from desktop
    loadNote: () => ipcRenderer.invoke('load-note'),

    // Save note with custom filename using file dialog
    saveNoteAs: (text) => ipcRenderer.invoke('save-note-as', text),

    // Show confirmation dialog for new note (checks for unsaved changes)
    newNote: () => ipcRenderer.invoke('new-note'),

    // Show file open dialog to load external TXT files
    openFile: () => ipcRenderer.invoke('open-file'),

    /**
     * Note Management (JSON Database)
     */
    // Get all notes from JSON storage
    getNotes: () => ipcRenderer.invoke('get-notes'),

    // Save/update note in JSON database
    saveJSONNote: (note) => ipcRenderer.invoke('save-json-note', note),

    // Delete note by ID from database
    deleteNote: (id) => ipcRenderer.invoke('delete-note', id),

    // Toggle favorite status of a note by ID
    toggleFavorite: (id) => ipcRenderer.invoke('toggle-favorite', id),

    /**
     * Settings & Preferences
     */
    // Get saved settings (font size, theme, etc.)
    getSettings: () => ipcRenderer.invoke('get-settings'),

    // Save settings to persistent storage
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

    /**
     * Window Management
     */
    // Open note in separate detached window
    openSeparateWindow: (noteObject) => ipcRenderer.send('open-separate-window', noteObject),

    // Get note data if this window is a popout
    getPopoutData: () => ipcRenderer.invoke('get-popout-data'),

    /**
     * Menu Integration
     */
    // Listen for menu action events from main process
    onMenuAction: (channel, callback) => ipcRenderer.on(channel, callback),

    /**
     * File Operations (NEW)
     * These provide access to filesystem operations through IPC
     */
    // Read file contents by path (with validation)
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),

    // Write content to file (with validation)
    writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),

    // Get file information (size, modified date, etc.)
    getFileInfo: (filePath) => ipcRenderer.invoke('get-file-info', filePath),

    // List files in a directory
    listDirectory: (dirPath) => ipcRenderer.invoke('list-directory', dirPath),

    /**
     * Terminal/Debug Logging (NEW)
     * Sends logs to main process console for debugging
     */
    // Log message to main process console
    log: (message, level = 'info') => ipcRenderer.send('log-message', { message, level }),

    // Send error to main process
    logError: (error) => ipcRenderer.send('log-message', { message: String(error), level: 'error' })
});

console.log('✅ Preload context bridge established');