/**
 * People Registry API Service
 * Provides REST endpoints for managing people, roles, and security features
 */

import express from 'express';
import Database from 'better-sqlite3';
import { getLocalDb } from '../database';
import { Person, PersonRole, PersonRestrictions, FaceDetection, PermissionCheck } from '../../types/index.js';
import { FaceDetectionWorker } from './face-detection-worker.js';

interface PermissionResult {
    allowed: boolean;
    reason: string;
    personId: string;
    deviceId: string;
    action: string;
    timestamp: string;
}

export class PeopleRegistryService {
    private db: Database.Database;
    private router: express.Router;
    private faceDetectionWorker: FaceDetectionWorker;

    constructor(faceDetectionWorker?: FaceDetectionWorker) {
        this.db = getLocalDb();
        this.router = express.Router();
        this.faceDetectionWorker = faceDetectionWorker!;
        this.setupRoutes();
    }

    private setupRoutes() {
        // GET /api/people - List all people
        this.router.get('/people', (req, res) => {
            try {
                const people = this.getAllPeople();
                res.json(people);
            } catch (error) {
                console.error('Error fetching people:', error);
                res.status(500).json({ error: 'Failed to fetch people' });
            }
        });

        // GET /api/people/:id - Get specific person
        this.router.get('/people/:id', (req, res) => {
            try {
                const person = this.getPersonById(req.params.id);
                if (!person) {
                    return res.status(404).json({ error: 'Person not found' });
                }
                res.json(person);
            } catch (error) {
                console.error('Error fetching person:', error);
                res.status(500).json({ error: 'Failed to fetch person' });
            }
        });

        // POST /api/people - Create new person
        this.router.post('/people', (req, res) => {
            try {
                const { name, role, restrictions } = req.body;

                if (!name || !role) {
                    return res.status(400).json({ error: 'Name and role are required' });
                }

                if (!['admin', 'adult', 'child', 'guest'].includes(role)) {
                    return res.status(400).json({ error: 'Invalid role' });
                }

                const person = this.createPerson(name, role as PersonRole, restrictions);
                res.status(201).json(person);
            } catch (error) {
                console.error('Error creating person:', error);
                res.status(500).json({ error: 'Failed to create person' });
            }
        });

        // PUT /api/people/:id - Update person
        this.router.put('/people/:id', (req, res) => {
            try {
                const { name, role, restrictions, faceEmbeddings } = req.body;

                const updatedPerson = this.updatePerson(req.params.id, {
                    name,
                    role,
                    restrictions,
                    faceEmbeddings
                });

                if (!updatedPerson) {
                    return res.status(404).json({ error: 'Person not found' });
                }

                res.json(updatedPerson);
            } catch (error) {
                console.error('Error updating person:', error);
                res.status(500).json({ error: 'Failed to update person' });
            }
        });

        // DELETE /api/people/:id - Delete person
        this.router.delete('/people/:id', (req, res) => {
            try {
                const deleted = this.deletePerson(req.params.id);
                if (!deleted) {
                    return res.status(404).json({ error: 'Person not found' });
                }
                res.json({ success: true });
            } catch (error) {
                console.error('Error deleting person:', error);
                res.status(500).json({ error: 'Failed to delete person' });
            }
        });

        // POST /api/people/:id/face-detection - Record face detection
        this.router.post('/people/:id/face-detection', (req, res) => {
            try {
                const { confidence, embedding, cameraId, location } = req.body;

                if (confidence === undefined || !embedding || !cameraId) {
                    return res.status(400).json({ error: 'Confidence, embedding, and cameraId are required' });
                }

                const detection = this.recordFaceDetection(req.params.id, confidence, embedding, cameraId, location);
                res.status(201).json(detection);
            } catch (error) {
                console.error('Error recording face detection:', error);
                res.status(500).json({ error: 'Failed to record face detection' });
            }
        });

        // GET /api/people/:id/detections - Get face detection history
        this.router.get('/people/:id/detections', (req, res) => {
            try {
                const limit = parseInt(req.query.limit as string) || 50;
                const detections = this.getFaceDetections(req.params.id, limit);
                res.json(detections);
            } catch (error) {
                console.error('Error fetching face detections:', error);
                res.status(500).json({ error: 'Failed to fetch face detections' });
            }
        });

        // POST /api/people/:id/register-face - Register face for person
        this.router.post('/people/:id/register-face', express.raw({ type: 'image/*', limit: '10mb' }), (req, res) => {
            this.registerFaceHandler(req, res);
        });
    }

    private registerFaceHandler(req: express.Request, res: express.Response): void {
        try {
            const personId = req.params.id;
            const imageBuffer = req.body as Buffer;

            if (!imageBuffer || imageBuffer.length === 0) {
                res.status(400).json({ error: 'Image data is required' });
                return;
            }

            if (!this.faceDetectionWorker) {
                res.status(500).json({ error: 'Face detection worker not available' });
                return;
            }

            this.faceDetectionWorker.registerFace(personId, imageBuffer)
                .then(success => {
                    if (success) {
                        res.json({ success: true, message: 'Face registered successfully' });
                    } else {
                        res.status(400).json({ error: 'Failed to register face' });
                    }
                })
                .catch(error => {
                    console.error('Error registering face:', error);
                    res.status(500).json({ error: 'Failed to register face' });
                });

        } catch (error) {
            console.error('Error in register face handler:', error);
            res.status(500).json({ error: 'Failed to register face' });
        }
    }

    private getAllPeople(): Person[] {
        const stmt = this.db.prepare(`
            SELECT id, name, role, face_embeddings, restrictions,
                   created_at, updated_at
            FROM people
            ORDER BY name
        `);

        const rows = stmt.all() as any[];
        return rows.map(row => ({
            id: row.id,
            name: row.name,
            role: row.role as PersonRole,
            faceEmbeddings: row.face_embeddings ? JSON.parse(row.face_embeddings) : null,
            restrictions: JSON.parse(row.restrictions),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));
    }

    private getPersonById(id: string): Person | null {
        const stmt = this.db.prepare(`
            SELECT id, name, role, face_embeddings, restrictions, preferences,
                   created_at, updated_at
            FROM people
            WHERE id = ?
        `);

        const row = stmt.get(id) as any;
        if (!row) return null;

        return {
            id: row.id,
            name: row.name,
            role: row.role as PersonRole,
            faceEmbeddings: row.face_embeddings ? JSON.parse(row.face_embeddings) : null,
            restrictions: JSON.parse(row.restrictions),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    private createPerson(name: string, role: PersonRole, restrictions?: PersonRestrictions): Person {
        const id = `person-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const defaultRestrictions: PersonRestrictions = {
            blockedDevices: [],
            blockedActions: [],
            timeLimits: [],
            allowedAreas: ['all']
        };

        const finalRestrictions = restrictions || defaultRestrictions;

        const stmt = this.db.prepare(`
            INSERT INTO people (id, name, role, restrictions)
            VALUES (?, ?, ?, ?)
        `);

        stmt.run(id, name, role, JSON.stringify(finalRestrictions));

        return this.getPersonById(id)!;
    }

    private updatePerson(id: string, updates: Partial<Person>): Person | null {
        const existing = this.getPersonById(id);
        if (!existing) return null;

        const updatedPerson = { ...existing, ...updates };

        const stmt = this.db.prepare(`
            UPDATE people
            SET name = ?, role = ?, restrictions = ?, face_embeddings = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        stmt.run(
            updatedPerson.name,
            updatedPerson.role,
            JSON.stringify(updatedPerson.restrictions),
            updatedPerson.faceEmbeddings ? JSON.stringify(updatedPerson.faceEmbeddings) : null,
            id
        );

        return this.getPersonById(id);
    }

    private deletePerson(id: string): boolean {
        const stmt = this.db.prepare('DELETE FROM people WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    private recordFaceDetection(personId: string, confidence: number, embedding: number[],
                               cameraId: string, location?: string): FaceDetection {
        const stmt = this.db.prepare(`
            INSERT INTO face_detections (person_id, confidence, embedding, camera_id, location)
            VALUES (?, ?, ?, ?, ?)
        `);

        const result = stmt.run(personId, confidence, JSON.stringify(embedding), cameraId, location);

        // Update person's last seen
        // TODO: Add last_seen columns to people table
        // const updateStmt = this.db.prepare(`
        //     UPDATE people
        //     SET last_seen = CURRENT_TIMESTAMP, last_seen_location = ?
        //     WHERE id = ?
        // `);
        // updateStmt.run(location, personId);

        return {
            personId,
            confidence,
            embedding,
            cameraId,
            timestamp: new Date(),
            location
        };
    }

    private getFaceDetections(personId: string, limit: number = 50): FaceDetection[] {
        const stmt = this.db.prepare(`
            SELECT id, person_id, confidence, embedding, camera_id, timestamp, location
            FROM face_detections
            WHERE person_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        `);

        const rows = stmt.all(personId, limit) as any[];
        return rows.map(row => ({
            id: row.id,
            personId: row.person_id,
            confidence: row.confidence,
            embedding: JSON.parse(row.embedding),
            cameraId: row.camera_id,
            timestamp: row.timestamp,
            location: row.location
        }));
    }

    private checkPermission(personId: string, deviceId: string, action: string, context?: any): PermissionResult {
        const person = this.getPersonById(personId);
        if (!person) {
            return {
                allowed: false,
                reason: 'Person not found',
                personId,
                deviceId,
                action,
                timestamp: new Date().toISOString()
            };
        }

        // Check role-based permissions
        if (person.role === 'admin') {
            return {
                allowed: true,
                reason: 'Admin access granted',
                personId,
                deviceId,
                action,
                timestamp: new Date().toISOString()
            };
        }

        // Check restrictions
        const restrictions = person.restrictions;

        // Check blocked devices
        if (restrictions.blockedDevices.includes(deviceId)) {
            return {
                allowed: false,
                reason: `Device ${deviceId} is blocked for this person`,
                personId,
                deviceId,
                action,
                timestamp: new Date().toISOString()
            };
        }

        // Check blocked actions
        if (restrictions.blockedActions.includes(action)) {
            return {
                allowed: false,
                reason: `Action ${action} is blocked for this person`,
                personId,
                deviceId,
                action,
                timestamp: new Date().toISOString()
            };
        }

        // Check time limits
        const now = new Date();
        const currentDay = now.getDay(); // 0 = Sunday
        const currentTime = now.getHours() * 100 + now.getMinutes(); // HHMM format

        for (const limit of restrictions.timeLimits) {
            if (limit.days.includes(currentDay)) {
                const [startHour, startMin] = limit.start.split(':').map(Number);
                const [endHour, endMin] = limit.end.split(':').map(Number);
                const startTime = startHour * 100 + startMin;
                const endTime = endHour * 100 + endMin;

                if (currentTime >= startTime && currentTime <= endTime) {
                    return {
                        allowed: false,
                        reason: `Time limit active: ${limit.start}-${limit.end} on day ${currentDay}`,
                        personId,
                        deviceId,
                        action,
                        timestamp: new Date().toISOString()
                    };
                }
            }
        }

        // Log the permission check
        const logStmt = this.db.prepare(`
            INSERT INTO permissions_log (person_id, device_id, action, allowed, reason, context)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        logStmt.run(personId, deviceId, action, true, 'Permission granted', JSON.stringify(context || {}));

        return {
            allowed: true,
            reason: 'Permission granted',
            personId,
            deviceId,
            action,
            timestamp: new Date().toISOString()
        };
    }

    getRouter(): express.Router {
        return this.router;
    }

    close() {
        // DB is managed by centralized database module
    }
}