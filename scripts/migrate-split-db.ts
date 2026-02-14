/**
 * Migration Script: Split elo.db → knowledge.db + local.db
 * 
 * This script reads data from the legacy elo.db and distributes it
 * into the two new databases:
 * 
 * - knowledge.db (versioned): drivers, correlation_patterns, rules, rule_metrics, suggestions
 * - local.db (not versioned): devices, events, requests, decisions, people, ai_usage,
 *   corrections, notifications, device_metrics, proactive_suggestions, permissions_log, face_detections
 * 
 * Safe to run multiple times — uses INSERT OR IGNORE to avoid duplicates.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const LEGACY_PATH = path.join(DATA_DIR, 'elo.db');
const KNOWLEDGE_PATH = path.join(DATA_DIR, 'knowledge.db');
const LOCAL_PATH = path.join(DATA_DIR, 'local.db');

// Tables that go to knowledge.db (reusable across environments)
const KNOWLEDGE_TABLES = [
    'drivers',
    'correlation_patterns',
    'rules',
    'rule_metrics',
    'suggestions',
];

// Tables that go to local.db (sensitive, environment-specific)
const LOCAL_TABLES = [
    'devices',
    'events',
    'requests',
    'decisions',
    'people',
    'ai_usage',
    'corrections',
    'notifications',
    'device_metrics',
    'proactive_suggestions',
    'permissions_log',
    'face_detections',
];

function tableExists(db: Database.Database, tableName: string): boolean {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName) as { name: string } | undefined;
    return !!row;
}

function getTableColumns(db: Database.Database, tableName: string): string[] {
    const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    return rows.map(r => r.name);
}

function migrateTable(source: Database.Database, target: Database.Database, tableName: string): number {
    if (!tableExists(source, tableName)) {
        console.log(`  ⏭  ${tableName}: not found in source, skipping`);
        return 0;
    }

    if (!tableExists(target, tableName)) {
        console.log(`  ⏭  ${tableName}: not found in target schema, skipping`);
        return 0;
    }

    // Get common columns between source and target
    const sourceColumns = getTableColumns(source, tableName);
    const targetColumns = getTableColumns(target, tableName);
    const commonColumns = sourceColumns.filter(c => targetColumns.includes(c));

    if (commonColumns.length === 0) {
        console.log(`  ⚠️  ${tableName}: no common columns, skipping`);
        return 0;
    }

    const columnList = commonColumns.join(', ');
    const placeholders = commonColumns.map(() => '?').join(', ');

    const rows = source.prepare(`SELECT ${columnList} FROM ${tableName}`).all() as Record<string, unknown>[];
    
    if (rows.length === 0) {
        console.log(`  ✅ ${tableName}: empty, nothing to migrate`);
        return 0;
    }

    const insertStmt = target.prepare(
        `INSERT OR IGNORE INTO ${tableName} (${columnList}) VALUES (${placeholders})`
    );

    const insertMany = target.transaction((data: Record<string, unknown>[]) => {
        let count = 0;
        for (const row of data) {
            const values = commonColumns.map(col => row[col]);
            const result = insertStmt.run(...values);
            if (result.changes > 0) count++;
        }
        return count;
    });

    const inserted = insertMany(rows);
    console.log(`  ✅ ${tableName}: ${inserted}/${rows.length} rows migrated`);
    return inserted;
}

async function migrate() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  ELO Database Migration: elo.db → knowledge.db + local.db');
    console.log('═══════════════════════════════════════════════════\n');

    // Check if legacy DB exists
    if (!fs.existsSync(LEGACY_PATH)) {
        console.log('No legacy elo.db found. Nothing to migrate.');
        console.log('New databases will be created automatically on first start.');
        return;
    }

    // Ensure data dir exists
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const legacyDb = new Database(LEGACY_PATH, { readonly: true });

    // ─── Initialize target databases with schema ─────────────────────────────

    // Import the database module to create schemas
    const { getKnowledgeDb, getLocalDb, closeAllDatabases } = await import('../src/server/database');
    const knowledgeDb = getKnowledgeDb();
    const localDb = getLocalDb();

    // ─── Migrate knowledge tables ────────────────────────────────────────────

    console.log('📚 Migrating KNOWLEDGE tables (versioned):');
    let knowledgeTotal = 0;
    for (const table of KNOWLEDGE_TABLES) {
        knowledgeTotal += migrateTable(legacyDb, knowledgeDb, table);
    }
    console.log(`\n   Total knowledge rows: ${knowledgeTotal}\n`);

    // ─── Migrate local tables ────────────────────────────────────────────────

    console.log('🔒 Migrating LOCAL tables (sensitive, not versioned):');
    let localTotal = 0;
    for (const table of LOCAL_TABLES) {
        localTotal += migrateTable(legacyDb, localDb, table);
    }
    console.log(`\n   Total local rows: ${localTotal}\n`);

    // ─── Summary ─────────────────────────────────────────────────────────────

    legacyDb.close();
    closeAllDatabases();

    console.log('═══════════════════════════════════════════════════');
    console.log('  Migration complete!');
    console.log('═══════════════════════════════════════════════════');
    console.log(`\n  📚 knowledge.db: ${KNOWLEDGE_PATH}`);
    console.log(`  🔒 local.db:     ${LOCAL_PATH}`);
    console.log(`  📦 legacy:       ${LEGACY_PATH} (can be removed after verification)`);
    console.log('\n  Next steps:');
    console.log('  1. Verify both databases have the expected data');
    console.log('  2. The old elo.db is preserved — remove it manually when ready');
    console.log('  3. Run: git rm --cached data/elo.db');
    console.log('');
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
