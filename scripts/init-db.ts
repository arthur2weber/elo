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

    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'guest', -- admin, child, guest
      face_embeddings TEXT, -- JSON array of face embeddings
      restrictions TEXT, -- JSON object with device/action restrictions
      preferences TEXT, -- JSON object with personal preferences
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      trigger_type TEXT NOT NULL, -- event, schedule, state
      trigger_config TEXT, -- JSON config for trigger
      conditions TEXT, -- JSON array of conditions
      actions TEXT, -- JSON array of actions
      confidence REAL DEFAULT 0.0, -- 0.0 to 1.0
      enabled BOOLEAN DEFAULT 1,
      created_by TEXT, -- person_id or 'system'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_triggered DATETIME,
      trigger_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      action TEXT NOT NULL,
      original_params TEXT, -- JSON
      corrected_params TEXT, -- JSON
      context TEXT, -- JSON with time, day, people_present
      applied BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      priority TEXT DEFAULT 'low', -- low, medium, high, critical
      category TEXT DEFAULT 'info', -- security, system, maintenance, info
      metadata TEXT, -- JSON object with additional data
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS device_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS correlation_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger_event_type TEXT NOT NULL,
      trigger_device_id TEXT,
      trigger_event_data TEXT, -- JSON object
      correlated_event_type TEXT NOT NULL,
      correlated_device_id TEXT,
      correlated_event_data TEXT, -- JSON object
      time_delay_seconds INTEGER NOT NULL, -- Average delay between events
      confidence REAL NOT NULL, -- Statistical confidence (0-1)
      frequency INTEGER NOT NULL, -- How many times this pattern occurred
      consistency REAL NOT NULL, -- How consistent the delay is (0-1)
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rule_metrics (
      rule_id INTEGER PRIMARY KEY,
      execution_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      last_executed DATETIME,
      average_execution_time REAL,
      user_feedback TEXT, -- positive, negative, neutral
      confidence REAL NOT NULL DEFAULT 0.5,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ttl_expires_at DATETIME,
      FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS proactive_suggestions (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      type TEXT NOT NULL, -- maintenance, optimization, investigation, monitoring
      priority TEXT NOT NULL, -- low, medium, high, urgent
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      recommendations TEXT NOT NULL, -- JSON array
      estimated_effort TEXT NOT NULL, -- quick, moderate, complex
      potential_impact TEXT NOT NULL, -- low, medium, high, critical
      confidence INTEGER NOT NULL, -- 0-100
      based_on_data TEXT NOT NULL, -- JSON object
      suggested_actions TEXT NOT NULL, -- JSON array
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
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
    CREATE INDEX IF NOT EXISTS idx_people_role ON people(role);
    CREATE INDEX IF NOT EXISTS idx_rules_trigger_type ON rules(trigger_type);
    CREATE INDEX IF NOT EXISTS idx_rules_enabled ON rules(enabled);
    CREATE INDEX IF NOT EXISTS idx_corrections_device_id ON corrections(device_id);
    CREATE INDEX IF NOT EXISTS idx_device_metrics_device_metric ON device_metrics(device_id, metric_name);
    CREATE INDEX IF NOT EXISTS idx_device_metrics_timestamp ON device_metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_notifications_category_priority ON notifications(category, priority);
    CREATE INDEX IF NOT EXISTS idx_notifications_sent_at ON notifications(sent_at);
    CREATE INDEX IF NOT EXISTS idx_correlation_patterns_trigger ON correlation_patterns(trigger_event_type, trigger_device_id);
    CREATE INDEX IF NOT EXISTS idx_correlation_patterns_correlated ON correlation_patterns(correlated_event_type, correlated_device_id);
    CREATE INDEX IF NOT EXISTS idx_correlation_patterns_confidence ON correlation_patterns(confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_correlation_patterns_last_seen ON correlation_patterns(last_seen);
    CREATE INDEX IF NOT EXISTS idx_rule_metrics_confidence ON rule_metrics(confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_rule_metrics_ttl_expires_at ON rule_metrics(ttl_expires_at);
    CREATE INDEX IF NOT EXISTS idx_rule_metrics_last_executed ON rule_metrics(last_executed);
    CREATE INDEX IF NOT EXISTS idx_proactive_suggestions_device ON proactive_suggestions(device_id);
    CREATE INDEX IF NOT EXISTS idx_proactive_suggestions_priority ON proactive_suggestions(priority DESC);
    CREATE INDEX IF NOT EXISTS idx_proactive_suggestions_expires_at ON proactive_suggestions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_proactive_suggestions_created_at ON proactive_suggestions(created_at DESC);
  `);

  console.log('Database initialized successfully at:', DB_PATH);
  db.close();
}

initDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});