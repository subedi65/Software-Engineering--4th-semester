const electron = require('electron');
const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, session } = electron;
const path = require('node:path');
const fs = require('node:fs');

console.log('Electron module loaded:', typeof electron);
console.log('App object:', typeof app);

let notesPath;
let settingsPath;
let tray = null;
let win = null;
const detachedWindowsMap = {};

// Helper functions
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

function createWindow() {
    win = new BrowserWindow({
        width: 1000,
        height: 650,
        icon: path.join(__dirname, 'logo.png'),
        backgroundColor: '#f4f4f4',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    const menu = Menu.buildFromTemplate([
        {
            label: 'File',
            submenu: [
                { label: 'Exit', role: 'quit' }
            ]
        }
    ]);
    Menu.setApplicationMenu(menu);

    win.loadFile('index.html');

    win.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            win.hide();
        }
    });
}

// MAIN APP STARTUP
app.on('ready', () => {
    notesPath = path.join(app.getPath('userData'), 'notes.json');
    settingsPath = path.join(app.getPath('userData'), 'settings.json');

    app.disableHardwareAcceleration();

    // Microphone permissions for voice dictation
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
        if (permission === 'audio-capture') return true;
        return false;
    });

    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'audio-capture') return callback(true);
        return callback(false);
    });

    createWindow();

    try {
        tray = new Tray(path.join(__dirname, 'icon.png'));
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
                    app.isQuitting = true;
                    app.quit();
                }
            }
        ]);
        tray.setToolTip('Quick Note Taker');
        tray.setContextMenu(trayMenu);
        tray.on('click', () => {
            if (!win) return;
            if (win.isVisible()) {
                win.hide();
            } else {
                win.show();
            }
        });
    } catch (e) {
        console.log("Tray creation skipped. Icon file missing.");
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC HANDLERS
ipcMain.on('open-separate-window', (event, noteObject) => {
    let subWindow = new BrowserWindow({
        width: 700,
        height: 600,
        icon: path.join(__dirname, 'logo.png'),
        title: noteObject.title || 'Note Popout',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    subWindow.loadFile('index.html');
    detachedWindowsMap[subWindow.webContents.id] = noteObject;

    subWindow.on('closed', () => {
        delete detachedWindowsMap[subWindow.webContents.id];
        subWindow = null;
    });
});

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
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
    });

    if (result.canceled) {
        return { success: false };
    }

    fs.writeFileSync(result.filePath, text, 'utf-8');
    return { success: true, filePath: result.filePath };
});

ipcMain.handle('open-file', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
        return { success: false };
    }

    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    return { success: true, content: content, filePath: result.filePaths[0] };
});

ipcMain.handle('new-note', async () => {
    const result = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Discard Changes', 'Cancel'],
        defaultId: 1,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Start a new note anyway?'
    });

    return { confirmed: result.response === 0 };
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
        notes[index] = { ...notes[index], ...note };
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

ipcMain.handle('toggle-favorite', async (event, id) => {
    try {
        const notes = readNotes();
        const index = notes.findIndex(n => n.id === id);

        if (index !== -1) {
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

ipcMain.handle('read-clipboard', async () => {
    try {
        const { clipboard } = require('electron');
        return { success: true, data: clipboard.readText() };
    } catch (error) {
        return { success: false, error: error.message, data: '' };
    }
});

ipcMain.handle('read-file', async (event, filePath) => {
    try {
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath.includes('..')) {
            throw new Error('Invalid file path: directory traversal not allowed');
        }

        if (!fs.existsSync(filePath)) {
            return { success: false, error: 'File not found', data: null };
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        console.log(`✅ File read successfully: ${filePath}`);
        return { success: true, data: content };
    } catch (error) {
        console.error(`❌ Error reading file: ${error.message}`);
        return { success: false, error: error.message, data: null };
    }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
    try {
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath.includes('..')) {
            throw new Error('Invalid file path: directory traversal not allowed');
        }

        const dirPath = path.dirname(filePath);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`✅ File written successfully: ${filePath}`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Error writing file: ${error.message}`);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-file-info', async (event, filePath) => {
    try {
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath.includes('..')) {
            throw new Error('Invalid file path: directory traversal not allowed');
        }

        if (!fs.existsSync(filePath)) {
            return { success: false, error: 'File not found' };
        }

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

ipcMain.handle('list-directory', async (event, dirPath) => {
    try {
        const normalizedPath = path.normalize(dirPath);
        if (normalizedPath.includes('..')) {
            throw new Error('Invalid path: directory traversal not allowed');
        }

        if (!fs.existsSync(dirPath)) {
            return { success: false, error: 'Directory not found' };
        }

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

ipcMain.on('log-message', (event, { message, level = 'info' }) => {
    const timestamp = new Date().toLocaleTimeString();
    const levelUpper = level.toUpperCase();

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
