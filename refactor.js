const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'server/src/routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Make (req, res) => async
  content = content.replace(/\(req, res\) => {/g, 'async (req, res) => {');
  // Handle some edge cases where it might be (req, res, next)
  content = content.replace(/\(req, res, next\) => {/g, 'async (req, res, next) => {');
  
  // Await db calls
  content = content.replace(/(?<!await\s)db\.([a-zA-Z0-9_]+)\(/g, 'await db.$1(');
  
  // Specifically fix db.getUserById(result.lastInsertRowid), as Postgres returns the full row now
  // Wait, in database.js, I updated createX methods to return result.rows[0].
  // So 'const result = await db.createUser(...); const user = await db.getUserById(result.lastInsertRowid);'
  // Should become: 'const user = await db.createUser(...);'
  content = content.replace(/const result = await db\.createUser\([^)]+\);\s+const user = await db\.getUserById\(result\.lastInsertRowid\);/g, 
                            'const user = await db.createUser($1); /* FIX THIS MANUALLY */'); // I'll fix this manually. Wait, regex matching might fail across lines.
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Refactored ${file}`);
});
