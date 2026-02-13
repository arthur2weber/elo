import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'elo.db');

async function initDatabase() {
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // Check if we're using better-sqlite3 (synchronous) or sqlite3 (asynchronous)

  const dbExec = async (query: string) => {
    db.exec(query);
  };

  // Create tables
  await dbExec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      ip TEXT,
      mac TEXT,
      protocol TEXT,
      endpoint TEXT,
      secrets TEXT, -- JSON string
      config TEXT, -- JSON string
      notes TEXT,
      brand TEXT,
      model TEXT,
      username TEXT,
      password TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      timestamp DATETIME NOT NULL,
      event_type TEXT,
      state TEXT, -- JSON string
      aggregated BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user TEXT,
      request TEXT,
      context TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME NOT NULL,
      user TEXT,
      context TEXT,
      action_key TEXT,
      suggestion TEXT,
      accepted BOOLEAN DEFAULT 0,
      status TEXT,
      details TEXT, -- JSON string
      request_id INTEGER,
      FOREIGN KEY(request_id) REFERENCES requests(id)
    );

    CREATE TABLE IF NOT EXISTS suggestions (
      id TEXT PRIMARY KEY,
      automation_name TEXT,
      message TEXT,
      code TEXT,
      status TEXT DEFAULT 'PENDING',
      required_approvals INTEGER DEFAULT 3,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_chars INTEGER,
      response_chars INTEGER,
      thinking_budget INTEGER,
      source TEXT,
      tags TEXT, -- JSON string
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id TEXT PRIMARY KEY,
      device_id TEXT,
      config TEXT, -- JSON string
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create indexes
  await dbExec(`
    CREATE INDEX IF NOT EXISTS idx_events_device_timestamp ON events(device_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
    CREATE INDEX IF NOT EXISTS idx_decisions_request_id ON decisions(request_id);
    CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
    CREATE INDEX IF NOT EXISTS idx_ai_usage_timestamp ON ai_usage(timestamp);
    CREATE INDEX IF NOT EXISTS idx_drivers_device_id ON drivers(device_id);
  `);

  console.log('Database initialized successfully at:', DB_PATH);
  db.close();
}

initDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});