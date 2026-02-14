/**
 * Correlation Engine
 * Analyzes historical events to detect causal patterns and correlations
 * Detects patterns like "window opens → AC turns on after 5 minutes"
 */

import Database from 'better-sqlite3';
import path from 'path';

export interface EventPattern {
    id: string;
    triggerEvent: {
        deviceId: string;
        action: string;
        state?: any;
    };
    effectEvent: {
        deviceId: string;
        action: string;
        state?: any;
    };
    timeDelay: number; // milliseconds between trigger and effect
    confidence: number; // 0.0 to 1.0
    frequency: number; // how many times this pattern occurred
    totalOccurrences: number; // total times trigger event occurred
    lastSeen: Date;
    created: Date;
}

export interface CorrelationResult {
    patterns: EventPattern[];
    analysisTime: Date;
    windowSize: number; // analysis window in milliseconds
    minConfidence: number;
    totalEventsAnalyzed: number;
}

export class CorrelationEngine {
    private db: Database.Database;
    private readonly ANALYSIS_WINDOW = 24 * 60 * 60 * 1000; // 24 hours
    private readonly MIN_CONFIDENCE = 0.6; // 60% confidence threshold
    private readonly MIN_FREQUENCY = 3; // minimum 3 occurrences

    constructor(dbPath: string = path.join(process.cwd(), 'data', 'elo.db')) {
        this.db = new Database(dbPath);
        this.ensureTables();
    }

    /**
     * Analyze recent events for correlations
     */
    async analyzeCorrelations(
        windowSizeMs: number = this.ANALYSIS_WINDOW,
        minConfidence: number = this.MIN_CONFIDENCE
    ): Promise<CorrelationResult> {
        console.log('[Correlation] Starting correlation analysis...');

        const startTime = new Date(Date.now() - windowSizeMs);
        const endTime = new Date();

        // Get events in the analysis window
        const events = this.getEventsInWindow(startTime, endTime);

        if (events.length < 10) {
            console.log(`[Correlation] Not enough events for analysis (${events.length})`);
            return {
                patterns: [],
                analysisTime: new Date(),
                windowSize: windowSizeMs,
                minConfidence,
                totalEventsAnalyzed: events.length
            };
        }

        console.log(`[Correlation] Analyzing ${events.length} events...`);

        // Find potential correlations
        const patterns = this.findCorrelations(events, minConfidence);

        // Save patterns to database
        this.savePatterns(patterns);

        console.log(`[Correlation] Found ${patterns.length} correlation patterns`);

        return {
            patterns,
            analysisTime: new Date(),
            windowSize: windowSizeMs,
            minConfidence,
            totalEventsAnalyzed: events.length
        };
    }

    /**
     * Get correlation patterns for a specific device/action
     */
    getPatternsForTrigger(deviceId: string, action: string): EventPattern[] {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM correlation_patterns
                WHERE trigger_device_id = ? AND trigger_event_type = ?
                AND confidence >= ?
                ORDER BY confidence DESC, frequency DESC
            `);

            const rows = stmt.all(deviceId, action, this.MIN_CONFIDENCE);
            return rows.map(this.rowToPattern);
        } catch (error) {
            console.error('[Correlation] Error getting patterns:', error);
            return [];
        }
    }

    /**
     * Get all high-confidence patterns
     */
    getHighConfidencePatterns(limit: number = 50): EventPattern[] {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM correlation_patterns
                WHERE confidence >= ?
                ORDER BY confidence DESC, frequency DESC
                LIMIT ?
            `);

            const rows = stmt.all(this.MIN_CONFIDENCE, limit);
            return rows.map(this.rowToPattern);
        } catch (error) {
            console.error('[Correlation] Error getting patterns:', error);
            return [];
        }
    }

    private getEventsInWindow(startTime: Date, endTime: Date): any[] {
        try {
            const stmt = this.db.prepare(`
                SELECT
                    id,
                    device_id,
                    timestamp,
                    event_type,
                    state
                FROM events
                WHERE timestamp >= ? AND timestamp <= ?
                ORDER BY timestamp ASC
            `);

            return stmt.all(startTime.toISOString(), endTime.toISOString());
        } catch (error) {
            console.error('[Correlation] Error getting events:', error);
            return [];
        }
    }

    private findCorrelations(events: any[], minConfidence: number): EventPattern[] {
        const patterns: EventPattern[] = [];
        const eventMap = new Map<string, any[]>();

        // Group events by device+action
        for (const event of events) {
            const key = `${event.device_id}:${event.event_type}`;
            if (!eventMap.has(key)) {
                eventMap.set(key, []);
            }
            eventMap.get(key)!.push(event);
        }

        // For each pair of different event types, check for correlations
        const eventTypes = Array.from(eventMap.keys());

        for (let i = 0; i < eventTypes.length; i++) {
            for (let j = 0; j < eventTypes.length; j++) {
                if (i === j) continue; // Skip same event type

                const triggerType = eventTypes[i];
                const effectType = eventTypes[j];

                const triggerEvents = eventMap.get(triggerType)!;
                const effectEvents = eventMap.get(effectType)!;

                if (triggerEvents.length < this.MIN_FREQUENCY) continue;

                const correlation = this.analyzeEventPair(triggerType, effectType, triggerEvents, effectEvents);

                if (correlation && correlation.confidence >= minConfidence) {
                    patterns.push(correlation);
                }
            }
        }

        return patterns.sort((a, b) => b.confidence - a.confidence);
    }

    private analyzeEventPair(
        triggerType: string,
        effectType: string,
        triggerEvents: any[],
        effectEvents: any[]
    ): EventPattern | null {
        const [triggerDevice, triggerAction] = triggerType.split(':');
        const [effectDevice, effectAction] = effectType.split(':');

        // Skip if same device (not interesting for automation)
        if (triggerDevice === effectDevice) return null;

        let totalCorrelations = 0;
        let totalTimeDelay = 0;
        const timeDelays: number[] = [];

        // For each trigger event, find if there's an effect event within a reasonable time window
        for (const trigger of triggerEvents) {
            const triggerTime = new Date(trigger.timestamp).getTime();
            const maxDelay = 30 * 60 * 1000; // 30 minutes max delay

            // Find effect events after trigger within time window
            const relevantEffects = effectEvents.filter(effect => {
                const effectTime = new Date(effect.timestamp).getTime();
                return effectTime > triggerTime && (effectTime - triggerTime) <= maxDelay;
            });

            if (relevantEffects.length > 0) {
                // Take the closest effect event
                const closestEffect = relevantEffects.reduce((closest, current) => {
                    const currentDelay = new Date(current.timestamp).getTime() - triggerTime;
                    const closestDelay = new Date(closest.timestamp).getTime() - triggerTime;
                    return currentDelay < closestDelay ? current : closest;
                });

                const delay = new Date(closestEffect.timestamp).getTime() - triggerTime;
                timeDelays.push(delay);
                totalTimeDelay += delay;
                totalCorrelations++;
            }
        }

        if (totalCorrelations < this.MIN_FREQUENCY) return null;

        // Calculate average time delay
        const avgTimeDelay = totalTimeDelay / totalCorrelations;

        // Calculate confidence based on frequency and consistency
        const frequency = totalCorrelations / triggerEvents.length;

        // Calculate consistency (how close delays are to average)
        const variance = timeDelays.reduce((sum, delay) => {
            return sum + Math.pow(delay - avgTimeDelay, 2);
        }, 0) / timeDelays.length;

        const stdDev = Math.sqrt(variance);
        const consistency = Math.max(0, 1 - (stdDev / avgTimeDelay)); // 1.0 = perfect consistency

        // Combined confidence score
        const confidence = (frequency * 0.7) + (consistency * 0.3);

        return {
            id: `${triggerType}→${effectType}`,
            triggerEvent: {
                deviceId: triggerDevice,
                action: triggerAction
            },
            effectEvent: {
                deviceId: effectDevice,
                action: effectAction
            },
            timeDelay: Math.round(avgTimeDelay),
            confidence: Math.round(confidence * 100) / 100,
            frequency: totalCorrelations,
            totalOccurrences: triggerEvents.length,
            lastSeen: new Date(),
            created: new Date()
        };
    }

    private savePatterns(patterns: EventPattern[]): void {
        const insertStmt = this.db.prepare(`
            INSERT OR REPLACE INTO correlation_patterns
            (trigger_event_type, trigger_device_id, trigger_event_data,
             correlated_event_type, correlated_device_id, correlated_event_data,
             time_delay_seconds, confidence, frequency, consistency, last_seen, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const pattern of patterns) {
            insertStmt.run(
                pattern.triggerEvent.action,
                pattern.triggerEvent.deviceId,
                pattern.triggerEvent.state ? JSON.stringify(pattern.triggerEvent.state) : null,
                pattern.effectEvent.action,
                pattern.effectEvent.deviceId,
                pattern.effectEvent.state ? JSON.stringify(pattern.effectEvent.state) : null,
                Math.round(pattern.timeDelay / 1000), // convert ms to seconds
                pattern.confidence,
                pattern.frequency,
                pattern.totalOccurrences > 0 ? pattern.frequency / pattern.totalOccurrences : 0, // consistency
                pattern.lastSeen.toISOString(),
                pattern.created.toISOString()
            );
        }
    }

    private rowToPattern(row: any): EventPattern {
        return {
            id: `${row.trigger_device_id}:${row.trigger_event_type}→${row.correlated_device_id}:${row.correlated_event_type}`,
            triggerEvent: {
                deviceId: row.trigger_device_id,
                action: row.trigger_event_type,
                state: row.trigger_event_data ? JSON.parse(row.trigger_event_data) : undefined
            },
            effectEvent: {
                deviceId: row.correlated_device_id,
                action: row.correlated_event_type,
                state: row.correlated_event_data ? JSON.parse(row.correlated_event_data) : undefined
            },
            timeDelay: (row.time_delay_seconds || 0) * 1000, // convert seconds to ms
            confidence: row.confidence,
            frequency: row.frequency,
            totalOccurrences: row.frequency > 0 && row.consistency > 0 ? Math.round(row.frequency / row.consistency) : row.frequency,
            lastSeen: new Date(row.last_seen),
            created: new Date(row.created_at)
        };
    }

    private ensureTables(): void {
        this.db.exec(`
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

            CREATE INDEX IF NOT EXISTS idx_correlation_patterns_confidence
            ON correlation_patterns(confidence DESC);

            CREATE INDEX IF NOT EXISTS idx_correlation_patterns_trigger
            ON correlation_patterns(trigger_event_type, trigger_device_id);
        `);
    }

    close(): void {
        this.db.close();
    }
}

// Singleton instance
let correlationEngine: CorrelationEngine | null = null;

export function getCorrelationEngine(): CorrelationEngine | null {
    return correlationEngine;
}

export function initCorrelationEngine(dbPath?: string): CorrelationEngine {
    correlationEngine = new CorrelationEngine(dbPath);
    return correlationEngine;
}                                                                       