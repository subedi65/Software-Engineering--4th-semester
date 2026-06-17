console.log('=== GLOBAL OBJECTS TEST ===');
console.log('global.require:', typeof global.require);
console.log('global.process:', typeof global.process);
console.log('global.process.type:', global.process?.type);
console.log('global.__dirname:', typeof global.__dirname);

console.log('\n=== MODULE OBJECT ===');
console.log('module:', typeof module);
console.log('module.exports:', typeof module.exports);

console.log('\n=== REQUIRE TESTS ===');
try {
    const fs = require('fs');
    console.log('✓ Can require fs:', typeof fs);
} catch (e) {
    console.log('✗ Cannot require fs');
}

try {
    const electron = require('electron');
    console.log('Type of electron:', typeof electron);
    console.log('Keys in electron object:', Object.keys(electron).slice(0, 5));
} catch (e) {
    console.log('Error requiring electron:', e.message);
}

console.log('\n=== PROCESS ENVIRONMENT ===');
console.log('process.versions.electron:', process.versions?.electron);
console.log('process.versions.node:', process.versions?.node);
