import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'elo.db');

async function migrateToFoundation() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('Database does not exist. Run init-db.ts first.');
    return;
  }

  const db = new Database(DB_PATH);

  const dbExec = async (query: string) => {
    db.exec(query);
  };

  console.log('Migrating database to Foundation schema...');

  try {
    // Add new tables
    await dbExec(`
      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'guest',
        face_embeddings TEXT,
        restrictions TEXT,
        preferences TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        trigger_type TEXT NOT NULL,
        trigger_config TEXT,
        conditions TEXT,
        actions TEXT,
        confidence REAL DEFAULT 0.0,
        enabled BOOLEAN DEFAULT 1,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_triggered DATETIME,
        trigger_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS corrections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        action TEXT NOT NULL,
        original_params TEXT,
        corrected_params TEXT,
        context TEXT,
        applied BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS device_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add new indexes
    await dbExec(`
      CREATE INDEX IF NOT EXISTS idx_people_role ON people(role);
      CREATE INDEX IF NOT EXISTS idx_rules_trigger_type ON rules(trigger_type);
      CREATE INDEX IF NOT EXISTS idx_rules_enabled ON rules(enabled);
      CREATE INDEX IF NOT EXISTS idx_corrections_device_id ON corrections(device_id);
      CREATE INDEX IF NOT EXISTS idx_device_metrics_device_metric ON device_metrics(device_id, metric_name);
      CREATE INDEX IF NOT EXISTS idx_device_metrics_timestamp ON device_metrics(timestamp);
    `);

    console.log('✅ Foundation schema migration completed successfully!');
    console.log('New tables added:');
    console.log('  - people (face recognition, roles, restrictions)');
    console.log('  - rules (contextual automation rules)');
    console.log('  - corrections (user corrections for learning)');
    console.log('  - device_metrics (time-series metrics for predictive maintenance)');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    db.close();
  }
}

migrateToFoundation().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});