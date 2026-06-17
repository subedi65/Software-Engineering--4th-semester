console.log('Loading electron...');
const electron = require('electron');
console.log('electron loaded, type:', typeof electron);
console.log('electron.app:', typeof electron.app);

if (electron.app) {
    console.log('app.whenReady:', typeof electron.app.whenReady);
}
