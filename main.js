const { app, BrowserWindow, ipcMain, dialog, Menu, Tray } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Menutempelate } = require('./menutempelate');

const notesPath = path.join(app.getPath('userData'), 'notes.json');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

app.disableHardwareAcceleration();

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

    win.on('close', (event) => {
        event.preventDefault();
        win.hide();
    });
}

function readNotes() {
    if (!fs.existsSync(notesPath)) return [];
    const data = fs.readFileSync(notesPath, 'utf8');
    return JSON.parse(data);
}

function writeNotes(notes) {
    fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2));
}

function readSettings() {
    if (!fs.existsSync(settingsPath)) return { fontSize: 16 };
    const data = fs.readFileSync(settingsPath, 'utf8');
    return JSON.parse(data);
}

function writeSettings(settings) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

app.whenReady().then(() => {
    createWindow();

    tray = new Tray(path.join(__dirname, 'tray-icon.png'));

    const trayMenu = Menu.buildFromTemplate([
        {
            label: 'Show App',
            click: () => {
                BrowserWindow.getAllWindows()[0].show();
            }
        },
        {
            label: 'Quit',
            click: () => {
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Quick Note Taker');
    tray.setContextMenu(trayMenu);

    tray.on('double-click', () => {
        const win = BrowserWindow.getAllWindows()[0];
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
        app.quit();
    }
});

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