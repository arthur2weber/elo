/**
 * Centralized Database Access Module
 * 
 * Separates data into two databases:
 * 
 * 1. **knowledge.db** (VERSIONED) — Reusable knowledge across environments:
 *    - drivers: Driver templates/examples per device type
 *    - correlation_patterns: Learned device behavior patterns
 *    - rules: Automation rule templates
 *    - rule_metrics: Rule confidence scores
 *    - suggestions: Automation suggestions
 * 
 * 2. **local.db** (NOT VERSIONED) — Sensitive, environment-specific data:
 *    - devices: IPs, passwords, MACs, local configs
 *    - events: Local event history
 *    - requests: User requests
 *    - decisions: Decisions taken
 *    - people: Faces, embeddings, restrictions
 *    - ai_usage: Local API usage
 *    - corrections: Applied corrections
 *    - notifications: Sent notifications
 *    - device_metrics: Local device metrics
 *    - proactive_suggestions: Device-specific suggestions
 *    - permissions_log: Permission audit log
 *    - face_detections: Face detection records
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// ─── Paths ───────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data');

const KNOWLEDGE_DB_PATH = process.env.ELO_KNOWLEDGE_DB_PATH || path.join(DATA_DIR, 'knowledge.db');
const LOCAL_DB_PATH = process.env.ELO_LOCAL_DB_PATH || path.join(DATA_DIR, 'local.db');

// Legacy path — for migration
const LEGACY_DB_PATH = process.env.ELO_DB_PATH || path.join(DATA_DIR, 'elo.db');

// ─── Singletons ──────────────────────────────────────────────────────────────

let _knowledgeDb: Database.Database | null = null;
let _localDb: Database.Database | null = null;

function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * Get the knowledge database (VERSIONED).
 * Contains reusable data: drivers, rules, correlation patterns, suggestions.
 */
export function getKnowledgeDb(): Database.Database {
    if (!_knowledgeDb) {
        ensureDataDir();
        _knowledgeDb = new Database(KNOWLEDGE_DB_PATH);
        _knowledgeDb.pragma('journal_mode = WAL');
        _knowledgeDb.pragma('foreign_keys = ON');
        initKnowledgeSchema(_knowledgeDb);
    }
    return _knowledgeDb;
}

/**
 * Get the local database (NOT versioned).
 * Contains sensitive/environment-specific data: devices, events, people, etc.
 */
export function getLocalDb(): Database.Database {
    if (!_localDb) {
        ensureDataDir();
        _localDb = new Database(LOCAL_DB_PATH);
        _localDb.pragma('journal_mode = WAL');
        _localDb.pragma('foreign_keys = ON');
        initLocalSchema(_localDb);
    }
    return _localDb;
}

/**
 * Get the legacy database path (for migration).
 */
export function getLegacyDbPath(): string {
    return LEGACY_DB_PATH;
}

/**
 * Check if the legacy elo.db exists (needs migration).
 */
export function hasLegacyDb(): boolean {
    return fs.existsSync(LEGACY_DB_PATH);
}

/**
 * Close all database connections (for graceful shutdown).
 */
export function closeAllDatabases(): void {
    if (_knowledgeDb) {
        _knowledgeDb.close();
        _knowledgeDb = null;
    }
    if (_localDb) {
        _localDb.close();
        _localDb = null;
    }
}

// ─── Paths export ────────────────────────────────────────────────────────────

export function getKnowledgeDbPath(): string {
    return KNOWLEDGE_DB_PATH;
}

export function getLocalDbPath(): string {
    return LOCAL_DB_PATH;
}

// ─── Schema: knowledge.db ────────────────────────────────────────────────────

function initKnowledgeSchema(db: Database.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS drivers (
            id TEXT PRIMARY KEY,
            device_id TEXT,
            config TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS correlation_patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trigger_event_type TEXT NOT NULL,
            trigger_device_id TEXT,
            trigger_event_data TEXT,
            correlated_event_type TEXT NOT NULL,
            correlated_device_id TEXT,
            correlated_event_data TEXT,
            time_delay_seconds INTEGER NOT NULL,
            confidence REAL NOT NULL,
            frequency INTEGER NOT NULL,
            consistency REAL NOT NULL,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

        CREATE TABLE IF NOT EXISTS rule_metrics (
            rule_id INTEGER PRIMARY KEY,
            execution_count INTEGER DEFAULT 0,
            success_count INTEGER DEFAULT 0,
            failure_count INTEGER DEFAULT 0,
            last_executed DATETIME,
            average_execution_time REAL,
            user_feedback TEXT,
            confidence REAL NOT NULL DEFAULT 0.5,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ttl_expires_at DATETIME,
            FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE
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

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_drivers_device_id ON drivers(device_id);
        CREATE INDEX IF NOT EXISTS idx_correlation_patterns_trigger ON correlation_patterns(trigger_event_type, trigger_device_id);
        CREATE INDEX IF NOT EXISTS idx_correlation_patterns_correlated ON correlation_patterns(correlated_event_type, correlated_device_id);
        CREATE INDEX IF NOT EXISTS idx_correlation_patterns_confidence ON correlation_patterns(confidence DESC);
        CREATE INDEX IF NOT EXISTS idx_correlation_patterns_last_seen ON correlation_patterns(last_seen);
        CREATE INDEX IF NOT EXISTS idx_rules_trigger_type ON rules(trigger_type);
        CREATE INDEX IF NOT EXISTS idx_rules_enabled ON rules(enabled);
        CREATE INDEX IF NOT EXISTS idx_rule_metrics_confidence ON rule_metrics(confidence DESC);
        CREATE INDEX IF NOT EXISTS idx_rule_metrics_ttl_expires_at ON rule_metrics(ttl_expires_at);
        CREATE INDEX IF NOT EXISTS idx_rule_metrics_last_executed ON rule_metrics(last_executed);
        CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
    `);
}

// ─── Schema: local.db ────────────────────────────────────────────────────────

function initLocalSchema(db: Database.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT,
            ip TEXT,
            mac TEXT,
            protocol TEXT,
            endpoint TEXT,
            secrets TEXT,
            config TEXT,
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
            state TEXT,
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
            details TEXT,
            request_id INTEGER,
            FOREIGN KEY(request_id) REFERENCES requests(id)
        );

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

        CREATE TABLE IF NOT EXISTS ai_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prompt_chars INTEGER,
            response_chars INTEGER,
            thinking_budget INTEGER,
            source TEXT,
            tags TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
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

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            priority TEXT DEFAULT 'low',
            category TEXT DEFAULT 'info',
            metadata TEXT,
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

        CREATE TABLE IF NOT EXISTS proactive_suggestions (
            id TEXT PRIMARY KEY,
            device_id TEXT NOT NULL,
            type TEXT NOT NULL,
            priority TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            reasoning TEXT NOT NULL,
            recommendations TEXT NOT NULL,
            estimated_effort TEXT NOT NULL,
            potential_impact TEXT NOT NULL,
            confidence INTEGER NOT NULL,
            based_on_data TEXT NOT NULL,
            suggested_actions TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS permissions_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id TEXT,
            device_id TEXT,
            action TEXT,
            allowed BOOLEAN,
            reason TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS face_detections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            camera_id TEXT NOT NULL,
            person_id TEXT,
            confidence REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_events_device_timestamp ON events(device_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
        CREATE INDEX IF NOT EXISTS idx_decisions_request_id ON decisions(request_id);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_timestamp ON ai_usage(timestamp);
        CREATE INDEX IF NOT EXISTS idx_people_role ON people(role);
        CREATE INDEX IF NOT EXISTS idx_corrections_device_id ON corrections(device_id);
        CREATE INDEX IF NOT EXISTS idx_device_metrics_device_metric ON device_metrics(device_id, metric_name);
        CREATE INDEX IF NOT EXISTS idx_device_metrics_timestamp ON device_metrics(timestamp);
        CREATE INDEX IF NOT EXISTS idx_notifications_category_priority ON notifications(category, priority);
        CREATE INDEX IF NOT EXISTS idx_notifications_sent_at ON notifications(sent_at);
        CREATE INDEX IF NOT EXISTS idx_proactive_suggestions_device ON proactive_suggestions(device_id);
        CREATE INDEX IF NOT EXISTS idx_proactive_suggestions_priority ON proactive_suggestions(priority DESC);
        CREATE INDEX IF NOT EXISTS idx_proactive_suggestions_expires_at ON proactive_suggestions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_proactive_suggestions_created_at ON proactive_suggestions(created_at DESC);
    `);
}
