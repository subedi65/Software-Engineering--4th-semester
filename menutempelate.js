const { BrowserWindow, app } = require('electron');

const Menutempelate = [
    {
        label: 'File',
        submenu: [
            {
                label: 'New Note',
                accelerator: 'CmdOrCtrl+N',
                click: () => {
                    BrowserWindow.getFocusedWindow().webContents.send('menu-new-note');
                }
            },
            {
                label: 'Open File',
                accelerator: 'CmdOrCtrl+O',
                click: () => {
                    BrowserWindow.getFocusedWindow().webContents.send('menu-open-file');
                }
            },
            {
                type: 'separator'
            },
            {
                label: 'Save',
                accelerator: 'CmdOrCtrl+S',
                click: () => {
                    BrowserWindow.getFocusedWindow().webContents.send('menu-save');
                }
            },
            {
                label: 'Save As',
                accelerator: 'CmdOrCtrl+Shift+S',
                click: () => {
                    BrowserWindow.getFocusedWindow().webContents.send('menu-save-as');
                }
            },
            {
                type: 'separator'
            },
            {
                label: 'Exit',
                role: 'quit',
                accelerator: 'CmdOrCtrl+Q',
                click: () => app.quit()
            }
        ]
    }
];

module.exports = { Menutempelate };