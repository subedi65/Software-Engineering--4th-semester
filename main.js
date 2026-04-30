const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {Menutempelate} = require('./menutempelate');

app.disableHardwareAcceleration();

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
    const menu =Menu.buildFromTemplate(Menutempelate);
    Menu.setApplicationMenu(menu);
    win.loadFile('index.html');

}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
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
    if (result.canceled) {
        return { success: false };
    }
    fs.writeFileSync(result.filePath, text, 'utf-8');
    return { success: true, filePath: result.filePath };
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