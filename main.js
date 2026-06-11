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

ipcMain.handle('save-as', async (event, text) => {
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

ipcMain.handle('get-settings', async () => {
    return readSettings();
});

ipcMain.handle('save-settings', async (event, settings) => {
    writeSettings(settings);
    return { success: true };
});