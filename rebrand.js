const fs = require('fs');
const path = require('path');

const files = [
  'server/package.json',
  'server/index.js',
  'server/dashboard/login.html',
  'server/dashboard/index.html',
  'server/dashboard/js/app.js',
  'server/dashboard/css/dashboard.css',
  'client/renderer/login.html',
  'client/renderer/index.html',
  'client/package.json',
  'client/main.js'
];

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/TimeTracker Pro/g, 'Epoch Dash');
    // Also handle lowercase timetracker-pro
    content = content.replace(/timetracker-pro/g, 'epoch-dash');
    // And timetracker.db
    content = content.replace(/timetracker\.db/g, 'epochdash.db');
    // And timetracker.local
    content = content.replace(/timetracker\.local/g, 'epochdash.local');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});
