const { app, BrowserWindow, ipcMain, dialog, Menu, Tray } = require('electron'); // Added Menu and Tray [cite: 14, 37]
const path = require('node:path');
const fs = require('node:fs');
const { Menutempelate } = require('./menutempelate');

// Path for storing multiple notes in the app's private data folder [cite: 61, 62]
const notesPath = path.join(app.getPath('userData'), 'notes.json');

app.disableHardwareAcceleration();

// Global variable for the tray
let tray = null; 

function createWindow() {
    const win = new BrowserWindow({
        width: 900,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    const menu = Menu.buildFromTemplate(Menutempelate);
    Menu.setApplicationMenu(menu);
    win.loadFile('index.html');

    // NEW: Hide window instead of closing
    win.on('close', (event) => {
        event.preventDefault(); // Stop the app from actually quitting [cite: 47]
        win.hide(); // Hide it instead [cite: 47]
    });
}

// JSON Storage Helper Functions [cite: 64, 65, 66]
function readNotes() {
    if (!fs.existsSync(notesPath)) return [];
    const data = fs.readFileSync(notesPath, 'utf8');
    return JSON.parse(data);
}

function writeNotes(notes) {
    fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2));
}

app.whenReady().then(() => {
    createWindow();

    // NEW: System Tray Setup
    // Ensure 'tray-icon.png' is in your project folder [cite: 42]
    tray = new Tray(path.join(__dirname, 'tray-icon.png'));
    const trayMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: () => { BrowserWindow.getAllWindows()[0].show(); } },
        { label: 'Quit', click: () => { app.quit(); } }
    ]);
    tray.setToolTip('Quick Note Taker');
    tray.setContextMenu(trayMenu); 

    // Double-click tray to toggle window
    tray.on('double-click', () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win.isVisible()) {
            win.hide();
        } else {
            win.show();
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC HANDLERS ---

// 1. Existing TXT Handlers
ipcMain.handle('save-note', async (event, text, filePath) => {
    const targetPath = filePath || path.join(app.getPath('desktop'), 'quicknote.txt');
    fs.writeFileSync(targetPath, text, 'utf-8');
    return { success: true };
});

ipcMain.handle('load-note', async () => {
    const filePath = path.join(app.getPath('documents'), 'quicknote.txt');
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
    }
    return '';
});

ipcMain.handle('save-as', async (event, text) => {
    const result = await dialog.showSaveDialog({
        defaultPath: "mynote.txt",
        filters: [{ name: 'Text Files', extensions: ["txt"] }]
    });
    if (result.canceled) return { success: false };
    fs.writeFileSync(result.filePath, text, 'utf-8');
    return { success: true, filePath: result.filePath };
});

ipcMain.handle('open-file', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false };
    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    return { success: true, content: content, filePath: result.filePaths[0] };
});

ipcMain.handle('new-note', async (event) => {
    const result = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Discard Changes', 'Cancel'],
        defaultId: 1,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Start a new note anyway?'
    });
    return { confirmed: result.response === 0 };
});

// 2. NEW: JSON Multiple Notes Handlers 
ipcMain.handle('get-notes', async () => {
    return readNotes();
});

ipcMain.handle('save-json-note', async (event, note) => {
    const notes = readNotes();
    const index = notes.findIndex(n => n.id === note.id); // Check if note exists [cite: 68]

    if (index === -1) {
        notes.push(note); // Create new note [cite: 68]
    } else {
        notes[index] = { ...notes[index], ...note }; // Update existing note [cite: 69, 71]
    }

    writeNotes(notes);
    return { success: true };
});

ipcMain.handle('delete-note', async (event, id) => {
    let notes = readNotes();
    notes = notes.filter(n => n.id !== id); // Remove matching note [cite: 70]
    writeNotes(notes);
    return { success: true };
});