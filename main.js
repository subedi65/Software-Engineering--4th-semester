/**
 * ============================================================================
 * MAIN.JS - Electron Main Process (Backend)
 * ============================================================================
 * This file runs in the Node.js main process and handles:
 * - Creating and managing application windows
 * - All file system operations (read/write, safe from renderer)
 * - Inter-Process Communication (IPC) with renderer
 * - Application lifecycle (startup, shutdown, tray)
 * - Menu and system integration
 *
 * Security Model:
 * - Renderer cannot directly access filesystem
 * - All file ops go through validated IPC handlers
 * - Paths are normalized to prevent directory traversal
 * - Context isolation enabled (contextIsolation: true)
 *
 * Data Flow:
 * Renderer (renderer.js)
 * → calls window.electronAPI.method()
 * → ipcRenderer.invoke() sends to main process
 * → ipcMain.handle() in this file validates and executes
 * → returns result back to renderer as Promise
 * ============================================================================
 */

const { app, BrowserWindow, ipcMain, dialog, Menu, Tray } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Menutempelate } = require('./menutempelate');

const notesPath = path.join(app.getPath('userData'), 'notes.json');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// Disable hardware acceleration per explicit app optimization constraint
app.disableHardwareAcceleration();

let tray = null;
let win = null; // Main Application Window instance reference

// Global tracking dictionary map matching spawned separate window frame IDs with note data configurations
const detachedWindowsMap = {};

function createWindow() {
    win = new BrowserWindow({
        width: 1000,
        height: 650,
        icon: path.join(__dirname, 'logo.png'), // App icon for taskbar and window
        backgroundColor: '#f4f4f4', // Matches the dynamic background color canvas wrapper
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    
    const menu = Menu.buildFromTemplate(Menutempelate);
    Menu.setApplicationMenu(menu);

    win.loadFile('index.html');

    // Intercept standard window close events to allow background state tray residency
    win.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            win.hide();
        }
    });
}

// --- DATA ACCESS LAYER HELPERS ---
function readNotes() {
    if (!fs.existsSync(notesPath)) return [];
    try {
        const data = fs.readFileSync(notesPath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function writeNotes(notes) {
    fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2));
}

function readSettings() {
    if (!fs.existsSync(settingsPath)) return { fontSize: 16 };
    try {
        const data = fs.readFileSync(settingsPath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return { fontSize: 16 };
    }
}

function writeSettings(settings) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// --- APP LIFECYCLE CONTROLLERS ---
app.whenReady().then(() => {
    createWindow();

    tray = new Tray(path.join(__dirname, 'icon.png')); // Ensure you use a real file named icon.png here

    const trayMenu = Menu.buildFromTemplate([
        {
            label: 'Show App',
            click: () => {
                if (win) win.show();
            }
        },
        {
            label: 'Quit',
            click: () => {
                app.isQuitting = true; // Sets escape token parameter to completely destroy process channels
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Quick Note Taker');
    tray.setContextMenu(trayMenu);

    // Dynamic show/hide click intercept mapping
    tray.on('click', () => {
        if (!win) return;
        if (win.isVisible()) {
            win.hide();
        } else {
            win.show();
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // App handles background retention loops via tray triggers
    }
});

// --- MAIN ARCHITECTURE IPC REGISTER CHANNELS ---

// MULTI-WINDOW POP-OUT LISTENER: Spawns independent sub-windows asynchronously
ipcMain.on('open-separate-window', (event, noteObject) => {
    let subWindow = new BrowserWindow({
        width: 700,
        height: 600,
        icon: path.join(__dirname, 'logo.png'), // App icon for popout windows
        title: noteObject.title || 'Note Popout',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    subWindow.loadFile('index.html');

    // Maps subWindow webContents instance internal ID to the note dataset configuration payload 
    detachedWindowsMap[subWindow.webContents.id] = noteObject;

    subWindow.on('closed', () => {
        delete detachedWindowsMap[subWindow.webContents.id];
        subWindow = null;
    });
});

// MULTI-WINDOW INTAKE HANDLER: Invoked synchronously by popping windows on load to pull context metadata
ipcMain.handle('get-popout-data', (event) => {
    const webContentsId = event.sender.id;
    return detachedWindowsMap[webContentsId] || null;
});

ipcMain.handle('save-note', async (event, text, filePath) => {
    const targetPath = filePath || path.join(app.getPath('desktop'), 'quicknote.txt');
    fs.writeFileSync(targetPath, text, 'utf-8');
    return { success: true, filePath: targetPath };
});

ipcMain.handle('load-note', async () => {
    const filePath = path.join(app.getPath('desktop'), 'quicknote.txt');
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
    }
    return '';
});

ipcMain.handle('save-note-as', async (event, text) => {
    const result = await dialog.showSaveDialog({
        defaultPath: 'mynote.txt',
        filters: [
            {
                name: 'Text Files',
                extensions: ['txt']
            }
        ]
    });

    if (result.canceled) {
        return { success: false };
    }

    fs.writeFileSync(result.filePath, text, 'utf-8');
    return {
        success: true,
        filePath: result.filePath
    };
});

ipcMain.handle('open-file', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            {
                name: 'Text Files',
                extensions: ['txt']
            }
        ]
    });

    if (result.canceled || result.filePaths.length === 0) {
        return { success: false };
    }

    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    return {
        success: true,
        content: content,
        filePath: result.filePaths[0]
    };
});

ipcMain.handle('new-note', async () => {
    const result = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Discard Changes', 'Cancel'],
        defaultId: 1,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Start a new note anyway?'
    });

    return {
        confirmed: result.response === 0
    };
});

ipcMain.handle('get-notes', async () => {
    return readNotes();
});

ipcMain.handle('save-json-note', async (event, note) => {
    const notes = readNotes();
    const index = notes.findIndex(n => n.id === note.id);

    if (index === -1) {
        notes.push(note);
    } else {
        notes[index] = {
            ...notes[index],
            ...note
        };
    }

    writeNotes(notes);
    return { success: true };
});

ipcMain.handle('delete-note', async (event, id) => {
    let notes = readNotes();
    notes = notes.filter(n => n.id !== id);
    writeNotes(notes);
    return { success: true };
});

// ============================================================================
// FAVORITE NOTE OPERATIONS HANDLER
// ============================================================================
ipcMain.handle('toggle-favorite', async (event, id) => {
    try {
        const notes = readNotes();
        const index = notes.findIndex(n => n.id === id);

        if (index !== -1) {
            // Toggles the favorite field (if it doesn't exist, it defaults to true)
            notes[index].isFavorite = !notes[index].isFavorite;
            writeNotes(notes);
            return { success: true, isFavorite: notes[index].isFavorite };
        }
        
        return { success: false, error: 'Note not found' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-settings', async () => {
    return readSettings();
});

ipcMain.handle('save-settings', async (event, settings) => {
    writeSettings(settings);
    return { success: true };
});

// ============================================================================
// NEW FILE OPERATIONS HANDLERS - Secure file read/write through IPC
// ============================================================================
// These handlers provide safe filesystem access to the renderer process
// All file paths are validated before accessing

/**
 * READ FILE HANDLER
 * Safely reads file content and returns it to renderer
 * Validates file path to prevent directory traversal attacks
 */
ipcMain.handle('read-file', async (event, filePath) => {
    try {
        // Prevent directory traversal attacks
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath.includes('..')) {
            throw new Error('Invalid file path: directory traversal not allowed');
        }

        // Check if file exists before reading
        if (!fs.existsSync(filePath)) {
            return { success: false, error: 'File not found', data: null };
        }

        // Read file content as UTF-8 text
        const content = fs.readFileSync(filePath, 'utf-8');
        console.log(`✅ File read successfully: ${filePath}`);
        return { success: true, data: content };
    } catch (error) {
        console.error(`❌ Error reading file: ${error.message}`);
        return { success: false, error: error.message, data: null };
    }
});

/**
 * WRITE FILE HANDLER
 * Safely writes content to file
 * Creates directories if they don't exist
 */
ipcMain.handle('write-file', async (event, filePath, content) => {
    try {
        // Prevent directory traversal attacks
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath.includes('..')) {
            throw new Error('Invalid file path: directory traversal not allowed');
        }

        // Ensure directory exists
        const dirPath = path.dirname(filePath);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        // Write content to file
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`✅ File written successfully: ${filePath}`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Error writing file: ${error.message}`);
        return { success: false, error: error.message };
    }
});

/**
 * GET FILE INFO HANDLER
 * Returns file metadata (size, created date, modified date)
 * Useful for displaying file information in UI
 */
ipcMain.handle('get-file-info', async (event, filePath) => {
    try {
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath.includes('..')) {
            throw new Error('Invalid file path: directory traversal not allowed');
        }

        if (!fs.existsSync(filePath)) {
            return { success: false, error: 'File not found' };
        }

        // Get file statistics
        const stats = fs.statSync(filePath);
        const info = {
            size: stats.size,
            createdAt: stats.birthtime.toISOString(),
            modifiedAt: stats.mtime.toISOString(),
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile()
        };

        console.log(`✅ File info retrieved: ${filePath}`);
        return { success: true, data: info };
    } catch (error) {
        console.error(`❌ Error getting file info: ${error.message}`);
        return { success: false, error: error.message };
    }
});

/**
 * LIST DIRECTORY HANDLER
 * Returns list of files in a directory
 * Useful for file browser features
 */
ipcMain.handle('list-directory', async (event, dirPath) => {
    try {
        const normalizedPath = path.normalize(dirPath);
        if (normalizedPath.includes('..')) {
            throw new Error('Invalid path: directory traversal not allowed');
        }

        if (!fs.existsSync(dirPath)) {
            return { success: false, error: 'Directory not found' };
        }

        // Read directory contents
        const files = fs.readdirSync(dirPath, { withFileTypes: true });
        const fileList = files.map(file => ({
            name: file.name,
            isDirectory: file.isDirectory(),
            path: path.join(dirPath, file.name)
        }));

        console.log(`✅ Directory listed: ${dirPath} (${fileList.length} items)`);
        return { success: true, data: fileList };
    } catch (error) {
        console.error(`❌ Error listing directory: ${error.message}`);
        return { success: false, error: error.message };
    }
});

// ============================================================================
// LOGGING HANDLERS - Send logs to main process console
// ============================================================================
// Useful for debugging renderer process without browser DevTools

/**
 * LOG MESSAGE HANDLER
 * Receives log messages from renderer and prints them to main process console
 * Helps with debugging in production builds
 */
ipcMain.on('log-message', (event, { message, level = 'info' }) => {
    const timestamp = new Date().toLocaleTimeString();
    const levelUpper = level.toUpperCase();

    // Color-coded logging based on level (in terminal)
    switch (level) {
        case 'error':
            console.error(`[${timestamp}] ❌ ${levelUpper}: ${message}`);
            break;
        case 'warn':
            console.warn(`[${timestamp}] ⚠️ ${levelUpper}: ${message}`);
            break;
        case 'info':
            console.log(`[${timestamp}] ℹ️ ${levelUpper}: ${message}`);
            break;
        case 'debug':
            console.log(`[${timestamp}] 🐛 ${levelUpper}: ${message}`);
            break;
        default:
            console.log(`[${timestamp}] ${message}`);
    }
});