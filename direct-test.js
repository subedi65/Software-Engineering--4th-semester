console.log('Testing direct Electron binary...');
const electron = require('electron');
console.log('electron module type:', typeof electron);

if (typeof electron === 'object' && electron.app) {
    console.log('✓ SUCCESS! electron.app is available');
} else {
    console.log('✗ electron module is not providing app object');
}
