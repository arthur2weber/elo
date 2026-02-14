#!/usr/bin/env tsx
/**
 * Database Migration: Add People Registry
 * Adds the people table and related structures for Phase 3 (Security + People)
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'elo.db');

function migratePeopleRegistry() {
    console.log('🔄 Starting People Registry migration...');

    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = new Database(DB_PATH);

    try {
        // Enable foreign keys
        db.pragma('foreign_keys = ON');

        // Create people table
        db.exec(`
            CREATE TABLE IF NOT EXISTS people (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('admin', 'adult', 'child', 'guest')),
                face_embeddings TEXT, -- JSON array of face embeddings
                restrictions TEXT NOT NULL, -- JSON object with restrictions
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen DATETIME,
                last_seen_location TEXT
            )
        `);

        // Add missing columns if they don't exist (for existing databases)
        const columns = db.prepare("PRAGMA table_info(people)").all();
        const columnNames = columns.map((col: any) => col.name);

        if (!columnNames.includes('last_seen')) {
            db.exec('ALTER TABLE people ADD COLUMN last_seen DATETIME');
        }
        if (!columnNames.includes('last_seen_location')) {
            db.exec('ALTER TABLE people ADD COLUMN last_seen_location TEXT');
        }

        // Create face_detections table for tracking detections
        db.exec(`
            CREATE TABLE IF NOT EXISTS face_detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                person_id TEXT,
                confidence REAL NOT NULL,
                embedding TEXT NOT NULL, -- JSON array
                camera_id TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                location TEXT,
                FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
            )
        `);

        // Add location column to existing face_detections table if it doesn't exist
        const faceDetectionColumns = db.prepare("PRAGMA table_info(face_detections)").all();
        const faceDetectionColumnNames = faceDetectionColumns.map((col: any) => col.name);
        
        if (!faceDetectionColumnNames.includes('location')) {
            db.exec('ALTER TABLE face_detections ADD COLUMN location TEXT');
            console.log('✅ Added location column to face_detections table');
        }
        if (!faceDetectionColumnNames.includes('embedding')) {
            db.exec('ALTER TABLE face_detections ADD COLUMN embedding TEXT');
            console.log('✅ Added embedding column to face_detections table');
        }

        // Create permissions_log table for audit trail
        db.exec(`
            CREATE TABLE IF NOT EXISTS permissions_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                person_id TEXT,
                device_id TEXT NOT NULL,
                action TEXT NOT NULL,
                allowed BOOLEAN NOT NULL,
                reason TEXT,
                context TEXT, -- JSON object with additional context
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
            )
        `);

        // Create indexes for performance
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_face_detections_person ON face_detections(person_id);
            CREATE INDEX IF NOT EXISTS idx_face_detections_camera ON face_detections(camera_id);
            CREATE INDEX IF NOT EXISTS idx_face_detections_timestamp ON face_detections(timestamp);
            CREATE INDEX IF NOT EXISTS idx_permissions_log_person ON permissions_log(person_id);
            CREATE INDEX IF NOT EXISTS idx_permissions_log_timestamp ON permissions_log(timestamp);
        `);

        // Insert default admin user (Arthur)
        const insertAdmin = db.prepare(`
            INSERT OR IGNORE INTO people (id, name, role, restrictions)
            VALUES (?, ?, ?, ?)
        `);

        const defaultRestrictions = JSON.stringify({
            blockedDevices: [],
            blockedActions: [],
            timeLimits: [],
            allowedAreas: ['all']
        });

        insertAdmin.run('admin-arthur', 'Arthur', 'admin', defaultRestrictions);

        console.log('✅ People Registry migration completed successfully!');
        console.log('📝 Created tables: people, face_detections, permissions_log');
        console.log('👤 Default admin user "Arthur" created');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        db.close();
    }
}

// Run migration if called directly
if (require.main === module) {
    migratePeopleRegistry();
}

export { migratePeopleRegistry };