console.log('Starting minimal test...');

try {
    console.log('About to require electron...');
    const electron = require('electron');
    console.log('✓ electron required, type:', typeof electron);
    
    if (typeof electron === 'string') {
        console.log('! electron is a string (path), this is expected from npm package');
        console.log('! When electron binary loads this file, it should provide API');
        console.log('! Path:', electron);
    } else {
        console.log('✓ electron is an object');
        console.log('✓ electron.app:', typeof electron.app);
    }
} catch (err) {
    console.error('✗ Error:', err.message);
}

console.log('Test complete');
