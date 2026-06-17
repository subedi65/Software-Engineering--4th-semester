console.log('Module loading...');

setTimeout(() => {
    console.log('\n=== AFTER 100ms DELAY ===');
    console.log('process.type:', global.process?.type);
    console.log('process.versions.electron:', global.process?.versions?.electron);
    
    try {
        const electron = require('electron');
        console.log('electron type:', typeof electron);
        if (typeof electron === 'object') {
            console.log('electron.app exists:', !!electron.app);
        }
    } catch (e) {
        console.log('Error:', e.message);
    }
}, 100);

console.log('Waiting...');
