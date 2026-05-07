const { BrowserWindow, app, Menu } = require('electron'); // [cite: 14]

const Menutempelate = [
    {
        label: "File", // [cite: 18, 19]
        submenu: [
            {
                label: "New Note", // 
                accelerator: "CmdOrCtrl+N", // 
                click: () => {
                    // Sends a message to renderer.js to trigger the New Note logic 
                    BrowserWindow.getFocusedWindow().webContents.send("menu-new-note");
                }
            },
            {
                label: "Open File", // 
                accelerator: "CmdOrCtrl+O", // 
                click: () => {
                    // Sends a message to renderer.js to open the file dialog [cite: 20, 26]
                    BrowserWindow.getFocusedWindow().webContents.send("menu-open-file");
                }
            },
            {
                type: "separator" // Adds a dividing line between sections 
            },
            {
                label: "Save",
                accelerator: "CmdOrCtrl+S",
                click: () => {
                    BrowserWindow.getFocusedWindow().webContents.send("menu-save"); // [cite: 19, 21]
                }
            },
            {
                label: "Save As",
                accelerator: "CmdOrCtrl+Shift+S",
                click: () => {
                    BrowserWindow.getFocusedWindow().webContents.send("menu-save-as"); // 
                }
            },
            {
                type: "separator"
            },
            {
                label: "Exit",
                role: "quit", // Standard role to quit the application 
                accelerator: "CmdOrCtrl+Q",
                click: () => app.quit() // 
            }
        ]
    }
];

module.exports = { Menutempelate };