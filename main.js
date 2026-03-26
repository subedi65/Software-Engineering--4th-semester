const {app,BrowserWindow,ipcMain} = require('electron');
const path=require("node:path");
const fs =require("node:fs");
function createwindow(){
    const win =new BrowserWindow({
        width :900,
        height:600,
        webPreferences:{
            preload:path.join(__dirname,"preload.js"),
            contextIsolation:true,
            nodeIntegration:false,
        }
    });
    win.loadFile("index.html");
}
app.whenReady().then(()=>{
    createwindow();
    app.on("activate",()=>{
        if(BrowserWindow.getAllWindows().length===0) createwindow();
        }); 
});
app.on("window-all-closed",()=>{
    if(process.platform!=="darwin") app.quit();
});
//IPC Handlers
ipcMain.handle("save-note",async(event,text)=>{
    const filePath=path.join(app.getPath("documents"),"quick-note.txt");
    fs.writeFileSync(filePath,text,"utf-8");
    return {success :true};
});
ipcMain.handle("load-note",async()=>{
    const filePath=path.join(app.getPath("documents"),"quick-note.txt");
    if(fs.existsSync(filePath)){
        return fs.readFileSync(filePath,"utf-8");
    }
    return "";
});