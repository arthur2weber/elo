#!/usr/bin/env tsx
/**
 * Test Permission Middleware
 * Tests the permission checking functionality
 */

import { checkPermission } from '../src/server/permission-middleware.js';
import Database from 'better-sqlite3';
import path from 'path';

async function testPermissionMiddleware() {
    console.log('🧪 Testing Permission Middleware...\n');

    const dbPath = path.join(process.cwd(), 'data', 'elo.db');
    const db = new Database(dbPath);

    try {
        // Test 1: Admin user should have all permissions
        console.log('1. Testing admin permissions...');
        const adminResult = await checkPermission({
            personId: 'admin-arthur',
            deviceId: 'tv-living-room',
            action: 'turn-on'
        });
        console.log('   Admin result:', adminResult.allowed ? 'ALLOWED' : 'DENIED', '-', adminResult.reason);
        console.log('');

        // Test 2: Automated action (no person) should be allowed
        console.log('2. Testing automated action...');
        const autoResult = await checkPermission({
            deviceId: 'tv-living-room',
            action: 'turn-on'
        });
        console.log('   Auto result:', autoResult.allowed ? 'ALLOWED' : 'DENIED', '-', autoResult.reason);
        console.log('');

        // Test 3: Create a test child user with restrictions
        console.log('3. Creating test child user with restrictions...');
        const childId = 'test-child-' + Date.now();

        // Insert test child user directly into database
        const insertStmt = db.prepare(`
            INSERT INTO people (id, name, role, restrictions, preferences)
            VALUES (?, ?, ?, ?, ?)
        `);

        const restrictions = JSON.stringify({
            blockedDevices: ['tv-living-room'],
            blockedActions: ['volume-up'],
            timeLimits: [
                {
                    start: '20:00',
                    end: '21:00',
                    days: [1, 2, 3, 4, 5] // Monday to Friday
                },
                {
                    start: '19:00',
                    end: '22:00',
                    days: [0, 6] // Saturday and Sunday
                }
            ],
            allowedAreas: []
        });

        insertStmt.run(childId, 'Test Child', 'child', restrictions, '{}');
        console.log('   Created child user:', childId);

        const childResult = await checkPermission({
            personId: childId,
            deviceId: 'tv-living-room',
            action: 'volume-up'
        });
        console.log('   Child blocked action result:', childResult.allowed ? 'ALLOWED' : 'DENIED', '-', childResult.reason);
        console.log('');

        // Test 4: Test allowed action for child
        console.log('4. Testing allowed action for child...');
        const childAllowedResult = await checkPermission({
            personId: childId,
            deviceId: 'lights-kitchen',
            action: 'turn-on'
        });
        console.log('   Child allowed result:', childAllowedResult.allowed ? 'ALLOWED' : 'DENIED', '-', childAllowedResult.reason);
        console.log('');

        // Test 5: Test blocked device for child
        console.log('5. Testing blocked device for child...');
        const childBlockedResult = await checkPermission({
            personId: childId,
            deviceId: 'tv-living-room',
            action: 'turn-on'
        });
        console.log('   Child blocked device result:', childBlockedResult.allowed ? 'ALLOWED' : 'DENIED', '-', childBlockedResult.reason);
        console.log('');

        // Test 6: Test unknown person
        console.log('6. Testing unknown person...');
        const unknownResult = await checkPermission({
            personId: 'unknown-person',
            deviceId: 'tv-living-room',
            action: 'turn-on'
        });
        console.log('   Unknown result:', unknownResult.allowed ? 'ALLOWED' : 'DENIED', '-', unknownResult.reason);
        console.log('');

        // Clean up test data
        console.log('7. Cleaning up test data...');
        db.prepare('DELETE FROM people WHERE id = ?').run(childId);
        console.log('   Removed test child user');

        console.log('✅ Permission Middleware test completed!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        db.close();
    }
}

// Run test if called directly
if (require.main === module) {
    testPermissionMiddleware();
}

export { testPermissionMiddleware };