const { BrowserWindow, app, ipcMain, dialog, Menu } = require('electron');

const Menutempelate = [
    {
        label: "File",
        submenu: [
            {
                label: "Save",
                accelerator: "CmdOrCtrl+S",
                click: () => {
                    BrowserWindow.getFocusedWindow().webContents.send("MENU_SAVE");
                }
            },
            {
                label: "Save As",
                accelerator: "CmdOrCtrl+Shift+S",
                click: () => {
                    BrowserWindow.getFocusedWindow().webContents.send("MENU_SAVE_AS");
                }
            },
            {
                type: "separator"
            },
            {
                label: "Exit",
                role: "quit",
                accelerator: "CmdOrCtrl+Q",
                click: () => app.quit()
            }
        ]
    }
];
module.exports = {Menutempelate};
