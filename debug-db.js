
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'elo.db');
const db = new Database(dbPath);

const rows = db.prepare('SELECT id, ip, username, password FROM devices').all();
console.log(JSON.stringify(rows, null, 2));
