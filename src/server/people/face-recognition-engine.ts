/**
 * Face Recognition Engine
 * Handles face matching against registered people using embeddings
 */

import Database from 'better-sqlite3';
import { getLocalDb } from '../database';
import { Person } from '../../types/index.js';

export interface RecognitionResult {
    personId: string | null;
    confidence: number;
    person?: Pick<Person, 'id' | 'name' | 'role' | 'faceEmbeddings' | 'restrictions'>;
    matchedEmbedding?: number[];
}

export class FaceRecognitionEngine {
    private db: Database.Database;

    constructor() {
        this.db = getLocalDb();
    }

    /**
     * Recognize a face by comparing its embedding against all registered people
     */
    async recognizeFace(embedding: number[], threshold: number = 0.6): Promise<RecognitionResult> {
        const people = this.getPeopleWithEmbeddings();

        let bestMatch: RecognitionResult = {
            personId: null,
            confidence: 0
        };

        for (const person of people) {
            if (!person.faceEmbeddings || person.faceEmbeddings.length === 0) continue;

            // Compare with all embeddings for this person
            for (const registeredEmbedding of person.faceEmbeddings) {
                const distance = this.calculateEuclideanDistance(embedding, registeredEmbedding);

                // Convert distance to confidence (lower distance = higher confidence)
                const confidence = Math.max(0, 1 - distance);

                if (distance < threshold && confidence > bestMatch.confidence) {
                    bestMatch = {
                        personId: person.id,
                        confidence,
                        person,
                        matchedEmbedding: registeredEmbedding
                    };
                }
            }
        }

        return bestMatch;
    }

    /**
     * Register a new face embedding for a person
     */
    async registerEmbedding(personId: string, embedding: number[]): Promise<boolean> {
        try {
            const person = this.getPersonById(personId);
            if (!person) {
                console.error(`[FaceRecognition] Person ${personId} not found`);
                return false;
            }

            const currentEmbeddings = person.faceEmbeddings || [];
            currentEmbeddings.push(embedding);

            // Update person with new embedding
            const updateStmt = this.db.prepare(`
                UPDATE people
                SET face_embeddings = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);

            updateStmt.run(JSON.stringify(currentEmbeddings), personId);

            console.log(`[FaceRecognition] Registered embedding for ${personId} (${currentEmbeddings.length} total)`);
            return true;

        } catch (error) {
            console.error(`[FaceRecognition] Error registering embedding for ${personId}:`, error);
            return false;
        }
    }

    /**
     * Remove all embeddings for a person
     */
    async clearEmbeddings(personId: string): Promise<boolean> {
        try {
            const updateStmt = this.db.prepare(`
                UPDATE people
                SET face_embeddings = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);

            const result = updateStmt.run(personId);
            return result.changes > 0;

        } catch (error) {
            console.error(`[FaceRecognition] Error clearing embeddings for ${personId}:`, error);
            return false;
        }
    }

    /**
     * Get recognition statistics
     */
    getStats(): {
        totalPeople: number;
        peopleWithEmbeddings: number;
        totalEmbeddings: number;
    } {
        const people = this.getPeopleWithEmbeddings();

        return {
            totalPeople: this.getTotalPeopleCount(),
            peopleWithEmbeddings: people.length,
            totalEmbeddings: people.reduce((sum, person) => sum + (person.faceEmbeddings?.length || 0), 0)
        };
    }

    /**
     * Calculate Euclidean distance between two embeddings
     */
    private calculateEuclideanDistance(a: number[], b: number[]): number {
        if (a.length !== b.length) return Infinity;

        let sum = 0;
        for (let i = 0; i < a.length; i++) {
            sum += Math.pow(a[i] - b[i], 2);
        }

        return Math.sqrt(sum);
    }

    /**
     * Get all people with their face embeddings
     */
    private getPeopleWithEmbeddings(): Array<Pick<Person, 'id' | 'name' | 'role' | 'faceEmbeddings' | 'restrictions'>> {
        const stmt = this.db.prepare(`
            SELECT id, name, role, face_embeddings, restrictions
            FROM people
            WHERE face_embeddings IS NOT NULL AND face_embeddings != '[]'
        `);

        const rows = stmt.all() as any[];
        return rows.map(row => ({
            id: row.id,
            name: row.name,
            role: row.role as any,
            faceEmbeddings: row.face_embeddings ? JSON.parse(row.face_embeddings) : null,
            restrictions: JSON.parse(row.restrictions)
        }));
    }

    /**
     * Get a person by ID
     */
    private getPersonById(id: string): Pick<Person, 'id' | 'name' | 'role' | 'faceEmbeddings' | 'restrictions'> | null {
        const stmt = this.db.prepare(`
            SELECT id, name, role, face_embeddings, restrictions
            FROM people
            WHERE id = ?
        `);

        const row = stmt.get(id) as any;
        if (!row) return null;

        return {
            id: row.id,
            name: row.name,
            role: row.role as any,
            faceEmbeddings: row.face_embeddings ? JSON.parse(row.face_embeddings) : null,
            restrictions: JSON.parse(row.restrictions)
        };
    }

    /**
     * Get total count of people
     */
    private getTotalPeopleCount(): number {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM people');
        const result = stmt.get() as any;
        return result.count;
    }

    close(): void {
        // DB is managed by centralized database module
    }
}