/**
 * Permission Middleware
 * Checks if a person has permission to execute an action on a device
 */

import Database from 'better-sqlite3';
import path from 'path';
import { Person, PermissionCheck } from '../types/index.js';
import { getNotificationService } from './notification-service.js';

export interface PermissionContext {
    personId?: string;
    deviceId: string;
    action: string;
    time?: Date;
    location?: string;
    otherPeople?: string[];
}

export interface PermissionResult {
    allowed: boolean;
    reason: string;
    personId?: string;
    deviceId: string;
    action: string;
    timestamp: Date;
}

/**
 * Check if a person has permission to execute an action on a device
 */
export async function checkPermission(context: PermissionContext, dbPath: string = path.join(process.cwd(), 'data', 'elo.db')): Promise<PermissionResult> {
    const db = new Database(dbPath);

    try {
        const result: PermissionResult = {
            allowed: false,
            reason: 'Unknown error',
            personId: context.personId,
            deviceId: context.deviceId,
            action: context.action,
            timestamp: new Date()
        };

        // If no person is specified, assume it's an automated action (allow for now)
        if (!context.personId) {
            result.allowed = true;
            result.reason = 'Automated action - no person context';
            logPermissionCheck(result, db);
            return result;
        }

        // Get person details
        const person = getPersonById(context.personId, db);
        if (!person) {
            result.reason = 'Person not found';
            result.personId = undefined; // Clear personId for logging
            logPermissionCheck(result, db);
            return result;
        }

        // Admin users have all permissions
        if (person.role === 'admin') {
            result.allowed = true;
            result.reason = 'Admin access granted';
            logPermissionCheck(result, db);
            return result;
        }

        const restrictions = person.restrictions;

        // Check blocked devices
        if (restrictions.blockedDevices.includes(context.deviceId)) {
            result.reason = `Device ${context.deviceId} is blocked for this person`;
            notifyBlockedAction(person, context.deviceId, context.action, result.reason);
            logPermissionCheck(result, db);
            return result;
        }

        // Check blocked actions
        if (restrictions.blockedActions.includes(context.action)) {
            result.reason = `Action ${context.action} is blocked for this person`;
            notifyBlockedAction(person, context.deviceId, context.action, result.reason);
            logPermissionCheck(result, db);
            return result;
        }

        // Check time limits
        const now = context.time || new Date();
        const currentDay = now.getDay(); // 0 = Sunday
        const currentTime = now.getHours() * 100 + now.getMinutes(); // HHMM format

        for (const limit of restrictions.timeLimits) {
            if (limit.days.includes(currentDay)) {
                const [startHour, startMin] = limit.start.split(':').map(Number);
                const [endHour, endMin] = limit.end.split(':').map(Number);
                const startTime = startHour * 100 + startMin;
                const endTime = endHour * 100 + endMin;

                if (currentTime >= startTime && currentTime <= endTime) {
                    result.reason = `Time limit active: ${limit.start}-${limit.end} on day ${currentDay}`;
                    notifyBlockedAction(person, context.deviceId, context.action, result.reason);
                    logPermissionCheck(result, db);
                    return result;
                }
            }
        }

        // Check allowed areas (if location is provided)
        if (context.location && !restrictions.allowedAreas.includes('all') && !restrictions.allowedAreas.includes(context.location)) {
            result.reason = `Location ${context.location} is not allowed for this person`;
            notifyBlockedAction(person, context.deviceId, context.action, result.reason);
            logPermissionCheck(result, db);
            return result;
        }

        // All checks passed
        result.allowed = true;
        result.reason = 'Permission granted';
        logPermissionCheck(result, db);
        return result;

    } catch (error) {
        console.error('[PermissionMiddleware] Error checking permission:', error);
        return {
            allowed: false,
            reason: 'Permission check failed due to error',
            personId: context.personId,
            deviceId: context.deviceId,
            action: context.action,
            timestamp: new Date()
        };
    } finally {
        db.close();
    }
}

/**
 * Send notification for blocked action
 */
function notifyBlockedAction(person: { name: string }, deviceId: string, action: string, reason: string): void {
    const notificationService = getNotificationService();
    if (notificationService) {
        notificationService.alertBlockedAction(person.name, deviceId, action, reason);
    }
}

/**
 * Log permission check to database
 */
function logPermissionCheck(result: PermissionResult, db: Database.Database): void {
    try {
        const stmt = db.prepare(`
            INSERT INTO permissions_log (person_id, device_id, action, allowed, reason, context)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            result.personId || null,
            result.deviceId,
            result.action,
            result.allowed ? 1 : 0,
            result.reason,
            JSON.stringify({
                timestamp: result.timestamp.toISOString()
            })
        );
    } catch (error) {
        console.error('[PermissionMiddleware] Failed to log permission check:', error);
    }
}

/**
 * Get person by ID
 */
function getPersonById(id: string, db: Database.Database): Pick<Person, 'id' | 'name' | 'role' | 'restrictions'> | null {
    const stmt = db.prepare(`
        SELECT id, name, role, restrictions
        FROM people
        WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
        id: row.id,
        name: row.name,
        role: row.role as any,
        restrictions: JSON.parse(row.restrictions)
    };
}