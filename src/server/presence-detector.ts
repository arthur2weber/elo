/**
 * Presence Detection
 * Tracks who is currently present in the house based on facial detections
 */

import Database from 'better-sqlite3';
import path from 'path';

export interface PresenceState {
    personId: string;
    personName: string;
    location: string;
    cameraId: string;
    confidence: number;
    lastSeen: Date;
    isPresent: boolean;
}

export interface PresenceSummary {
    totalPeople: number;
    presentPeople: string[];
    locations: Record<string, string[]>; // location -> personIds
    lastUpdated: Date;
}

export class PresenceDetector {
    private db: Database.Database;
    private presenceStates: Map<string, PresenceState> = new Map();
    private readonly PRESENCE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

    constructor(dbPath: string = path.join(process.cwd(), 'data', 'elo.db')) {
        this.db = new Database(dbPath);
        this.loadPresenceStates();
    }

    /**
     * Update presence based on face detection
     */
    updatePresence(detection: {
        personId?: string;
        cameraId: string;
        location?: string;
        confidence: number;
        timestamp: Date;
    }): void {
        if (!detection.personId) {
            // Unknown person - don't update presence
            return;
        }

        const personId = detection.personId;
        const now = detection.timestamp;

        // Get person name
        const personName = this.getPersonName(personId);
        if (!personName) return;

        const existingState = this.presenceStates.get(personId);

        const newState: PresenceState = {
            personId,
            personName,
            location: detection.location || 'unknown',
            cameraId: detection.cameraId,
            confidence: detection.confidence,
            lastSeen: now,
            isPresent: true
        };

        // Update or add presence state
        this.presenceStates.set(personId, newState);

        // Log presence update
        console.log(`[Presence] ${personName} detected at ${detection.location} (${detection.cameraId})`);

        // Clean up old presence states
        this.cleanupPresenceStates();
    }

    /**
     * Get current presence summary
     */
    getPresenceSummary(): PresenceSummary {
        const presentPeople: string[] = [];
        const locations: Record<string, string[]> = {};

        for (const state of this.presenceStates.values()) {
            if (state.isPresent) {
                presentPeople.push(state.personId);

                if (!locations[state.location]) {
                    locations[state.location] = [];
                }
                locations[state.location].push(state.personId);
            }
        }

        return {
            totalPeople: this.presenceStates.size,
            presentPeople,
            locations,
            lastUpdated: new Date()
        };
    }

    /**
     * Get presence state for a specific person
     */
    getPersonPresence(personId: string): PresenceState | null {
        return this.presenceStates.get(personId) || null;
    }

    /**
     * Check if a person is currently present
     */
    isPersonPresent(personId: string): boolean {
        const state = this.presenceStates.get(personId);
        return state ? state.isPresent : false;
    }

    /**
     * Get all people currently present
     */
    getPresentPeople(): PresenceState[] {
        return Array.from(this.presenceStates.values()).filter(state => state.isPresent);
    }

    /**
     * Get people present in a specific location
     */
    getPeopleInLocation(location: string): PresenceState[] {
        return Array.from(this.presenceStates.values()).filter(
            state => state.isPresent && state.location === location
        );
    }

    /**
     * Force refresh presence states from recent detections
     */
    refreshPresenceStates(): void {
        try {
            // Get recent face detections (last 10 minutes)
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            const stmt = this.db.prepare(`
                SELECT DISTINCT person_id, camera_id, location, confidence, timestamp
                FROM face_detections
                WHERE person_id IS NOT NULL
                AND timestamp > ?
                ORDER BY timestamp DESC
            `);

            const recentDetections = stmt.all(tenMinutesAgo.toISOString()) as Array<{
                person_id: string;
                camera_id: string;
                location: string;
                confidence: number;
                timestamp: string;
            }>;

            // Group by person and get most recent detection
            const personDetections = new Map<string, any>();
            for (const detection of recentDetections) {
                if (!personDetections.has(detection.person_id)) {
                    personDetections.set(detection.person_id, detection);
                }
            }

            // Update presence states
            for (const [personId, detection] of personDetections) {
                this.updatePresence({
                    personId,
                    cameraId: detection.camera_id,
                    location: detection.location,
                    confidence: detection.confidence,
                    timestamp: new Date(detection.timestamp)
                });
            }

            console.log(`[Presence] Refreshed presence for ${personDetections.size} people`);

        } catch (error) {
            console.error('[Presence] Error refreshing presence states:', error);
        }
    }

    private loadPresenceStates(): void {
        // Load recent presence states from database
        this.refreshPresenceStates();
    }

    private cleanupPresenceStates(): void {
        const now = Date.now();

        for (const [personId, state] of this.presenceStates) {
            const timeSinceLastSeen = now - state.lastSeen.getTime();

            if (timeSinceLastSeen > this.PRESENCE_TIMEOUT) {
                state.isPresent = false;
                console.log(`[Presence] ${state.personName} marked as not present (timeout)`);
            }
        }
    }

    private getPersonName(personId: string): string | null {
        try {
            const stmt = this.db.prepare('SELECT name FROM people WHERE id = ?');
            const result = stmt.get(personId) as { name: string } | undefined;
            return result ? result.name : null;
        } catch (error) {
            console.error('[Presence] Error getting person name:', error);
            return null;
        }
    }

    close(): void {
        this.db.close();
    }
}

// Singleton instance
let presenceDetector: PresenceDetector | null = null;

export function getPresenceDetector(): PresenceDetector | null {
    return presenceDetector;
}

export function initPresenceDetector(dbPath?: string): PresenceDetector {
    presenceDetector = new PresenceDetector(dbPath);
    return presenceDetector;
}