const electron = require('electron');
console.log('ELECTRON EXPORTS:', Object.keys(electron));
console.log('APP:', electron.app ? 'exists' : 'missing');
process.exit(0);
