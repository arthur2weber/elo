/**
 * Face Detection Worker
 * Captures frames from cameras and provides face detection using face-api.js
 */

import Database from 'better-sqlite3';
import { getLocalDb } from '../database';
import path from 'path';
import { Person, FaceDetection } from '../../types/index.js';
import { FaceRecognitionEngine, RecognitionResult } from './face-recognition-engine.js';
import { getPresenceDetector } from './presence-detector.js';

// Dynamic imports for face-api.js
const faceapi = require('face-api.js');
const canvas = require('canvas');
const { Canvas, Image, ImageData, createCanvas } = canvas;

export interface CameraConfig {
    id: string;
    name: string;
    streamUrl: string;
    location?: string;
    enabled: boolean;
}

export interface FaceDetectionResult {
    personId?: string;
    confidence: number;
    embedding: number[];
    cameraId: string;
    location?: string;
    timestamp: Date;
    imageData?: Buffer; // Optional for debugging
}

export class FaceDetectionWorker {
    private db: Database.Database;
    private cameras: Map<string, CameraConfig> = new Map();
    private isRunning = false;
    private detectionInterval: NodeJS.Timeout | null = null;
    private recognitionEngine: FaceRecognitionEngine;
    private presenceDetector: any;
    // Motion detection: store previous frame hash per camera
    private previousFrames: Map<string, Buffer> = new Map();
    private motionCooldown: Map<string, number> = new Map();
    private static readonly MOTION_THRESHOLD = 0.05; // 5% pixel difference = motion
    private static readonly MOTION_COOLDOWN_MS = 30000; // 30s cooldown after motion detection
    private static readonly LOW_RES_WIDTH = 160; // Tiny resolution for motion detection
    private static readonly LOW_RES_HEIGHT = 120;

    constructor() {
        this.db = getLocalDb();
        this.recognitionEngine = new FaceRecognitionEngine();
    }

    async initialize(): Promise<void> {
        console.log('[FaceDetection] Initializing face detection worker...');

        // Configure face-api.js to use canvas
        faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

        // Load face detection models
        const modelsPath = path.join(process.cwd(), 'models');
        await this.loadFaceModels(modelsPath);

        // Initialize presence detector
        this.presenceDetector = require('./presence-detector.js').getPresenceDetector();

        // Load camera configurations
        await this.loadCameras();

        console.log(`[FaceDetection] Initialized with ${this.cameras.size} cameras`);
    }

    private async loadCameras(): Promise<void> {
        // Load cameras from database
        try {
            const stmt = this.db.prepare(`
                SELECT id, name, ip, type, notes FROM devices
                WHERE (type LIKE '%camera%' OR type LIKE '%ipcam%' OR type LIKE '%onvif%')
                AND ip IS NOT NULL AND ip != ''
                AND id NOT LIKE 'test-%'
            `);
            const dbCameras = stmt.all() as any[];

            for (const cam of dbCameras) {
                const go2rtcBase = process.env.GO2RTC_URL || 'http://127.0.0.1:1984';
                const streamUrl = cam.ip
                    ? `${go2rtcBase}/api/frame.jpeg?src=${cam.id}`
                    : null;
                if (streamUrl) {
                    this.cameras.set(cam.id, {
                        id: cam.id,
                        name: cam.name || cam.id,
                        streamUrl,
                        location: cam.name || 'unknown',
                        enabled: true
                    });
                }
            }

            if (this.cameras.size === 0) {
                console.log('[FaceDetection] No cameras found in database, using defaults');
                // Fallback to hardcoded defaults
                const defaults: CameraConfig[] = [
                    {
                        id: 'camera-front-door',
                        name: 'Front Door Camera',
                        streamUrl: `${process.env.GO2RTC_URL || 'http://127.0.0.1:1984'}/api/frame.jpeg?src=camera-front-door`,
                        location: 'front-door',
                        enabled: true
                    },
                    {
                        id: 'camera-living-room',
                        name: 'Living Room Camera',
                        streamUrl: `${process.env.GO2RTC_URL || 'http://127.0.0.1:1984'}/api/frame.jpeg?src=camera-living-room`,
                        location: 'living-room',
                        enabled: true
                    }
                ];
                defaults.forEach(camera => this.cameras.set(camera.id, camera));
            }
        } catch (error) {
            console.error('[FaceDetection] Error loading cameras from DB:', error);
        }
    }

    private async loadFaceModels(modelsPath: string): Promise<void> {
        try {
            console.log('[FaceDetection] Loading face detection models...');

            // Ensure models directory exists
            const fs = require('fs');
            if (!fs.existsSync(modelsPath)) {
                fs.mkdirSync(modelsPath, { recursive: true });
            }

            // Load models (these need to be downloaded separately)
            await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath);
            await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
            await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);

            console.log('[FaceDetection] Face detection models loaded successfully');
        } catch (error) {
            console.error('[FaceDetection] Failed to load face models:', error);
            throw error;
        }
    }

    async start(): Promise<void> {
        if (this.isRunning) return;

        console.log('[FaceDetection] Starting face detection worker...');
        this.isRunning = true;

        // Start detection loop — motion check every 30s, face detection only on motion
        this.detectionInterval = setInterval(async () => {
            try {
                await this.processAllCameras();
            } catch (error) {
                console.error('[FaceDetection] Error in detection loop:', error);
            }
        }, 30000); // Check for motion every 30 seconds

        console.log('[FaceDetection] Worker started successfully');
    }

    async stop(): Promise<void> {
        if (!this.isRunning) return;

        console.log('[FaceDetection] Stopping face detection worker...');
        this.isRunning = false;

        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }

        console.log('[FaceDetection] Worker stopped');
    }

    private async processAllCameras(): Promise<void> {
        // Process cameras sequentially to avoid overwhelming go2rtc
        for (const camera of this.cameras.values()) {
            await this.processCamera(camera);
        }
    }

    private async processCamera(camera: CameraConfig): Promise<void> {
        try {
            // Step 1: Capture LOW-RES frame for motion detection (cheap)
            const go2rtcBase = process.env.GO2RTC_URL || 'http://127.0.0.1:1984';
            const lowResUrl = `${go2rtcBase}/api/frame.jpeg?src=${camera.id}&width=${FaceDetectionWorker.LOW_RES_WIDTH}&height=${FaceDetectionWorker.LOW_RES_HEIGHT}`;

            const lowResBuffer = await this.captureFrame(lowResUrl, 1); // single attempt, fast
            if (!lowResBuffer || lowResBuffer.byteLength < 500) return;

            // Step 2: Check if there's motion compared to previous frame
            const hasMotion = this.detectMotion(camera.id, lowResBuffer);
            if (!hasMotion) return; // No motion — skip expensive face detection

            // Step 3: Check cooldown — avoid spamming face detection
            const lastMotion = this.motionCooldown.get(camera.id) || 0;
            if (Date.now() - lastMotion < FaceDetectionWorker.MOTION_COOLDOWN_MS) return;
            this.motionCooldown.set(camera.id, Date.now());

            console.log(`[FaceDetection] Motion detected in ${camera.id}, capturing high-res frame...`);

            // Step 4: Motion detected! Capture HIGH-RES frame for face recognition
            const imageBuffer = await this.captureFrame(camera.streamUrl);
            if (!imageBuffer) {
                console.warn(`[FaceDetection] No high-res frame captured from ${camera.id}`);
                return;
            }

            // Step 5: Run expensive face detection only now
            await this.detectFaces(imageBuffer, camera);

        } catch (error) {
            console.error(`[FaceDetection] Error processing camera ${camera.id}:`, error);
        }
    }

    /**
     * Simple motion detection by comparing pixel data between frames.
     * Uses raw buffer byte comparison for speed — no canvas needed.
     */
    private detectMotion(cameraId: string, currentFrame: Buffer): boolean {
        const previousFrame = this.previousFrames.get(cameraId);
        this.previousFrames.set(cameraId, currentFrame);

        if (!previousFrame) return false; // First frame — no comparison possible

        // Compare frame sizes first (fast reject if camera changed resolution)
        if (previousFrame.byteLength !== currentFrame.byteLength) return true;

        // Sample comparison: check every Nth byte for speed
        const sampleStep = Math.max(1, Math.floor(currentFrame.byteLength / 500)); // ~500 samples
        let diffCount = 0;
        const totalSamples = Math.floor(currentFrame.byteLength / sampleStep);

        for (let i = 0; i < currentFrame.byteLength; i += sampleStep) {
            if (Math.abs(currentFrame[i] - previousFrame[i]) > 30) { // threshold per byte
                diffCount++;
            }
        }

        const diffRatio = diffCount / totalSamples;
        return diffRatio > FaceDetectionWorker.MOTION_THRESHOLD;
    }

    private async captureFrame(streamUrl: string, maxRetries: number = 3): Promise<Buffer | null> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);

                const response = await fetch(streamUrl, {
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    console.warn(`[FaceDetection] Failed to capture frame (attempt ${attempt}): ${response.status}`);
                    continue;
                }

                const buffer = await response.arrayBuffer();
                if (buffer.byteLength < 1000) {
                    console.warn(`[FaceDetection] Frame too small (${buffer.byteLength} bytes), retrying...`);
                    continue;
                }
                return Buffer.from(buffer);
            } catch (error: any) {
                const cause = error?.cause?.message || error?.cause?.code || '';
                if (attempt < maxRetries) {
                    console.warn(`[FaceDetection] Frame capture attempt ${attempt} failed (${cause}), retrying in 2s...`);
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    console.warn(`[FaceDetection] Frame capture failed after ${maxRetries} attempts: ${error?.message} (${cause})`);
                }
            }
        }
        return null;
    }

    private async detectFaces(imageBuffer: Buffer, camera: CameraConfig): Promise<void> {
        try {
            // Load image into canvas
            const img = new Image();
            img.src = imageBuffer;

            const cvs = createCanvas(img.width, img.height);
            const ctx = cvs.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Detect faces
            const detections = await faceapi
                .detectAllFaces(cvs)
                .withFaceLandmarks()
                .withFaceDescriptors();

            if (detections.length === 0) {
                return; // No faces detected — normal, silent
            }

            console.log(`[FaceDetection] Detected ${detections.length} face(s) in ${camera.id}`);

            // Process each detected face
            for (const detection of detections) {
                const embedding = Array.from(detection.descriptor) as number[];

                // Try to recognize the face
                const recognitionResult = await this.recognitionEngine.recognizeFace(embedding);

                let result: FaceDetectionResult;
                if (recognitionResult.personId && recognitionResult.confidence > 0.7) {
                    // Known person recognized
                    result = {
                        personId: recognitionResult.personId,
                        confidence: recognitionResult.confidence,
                        embedding: embedding,
                        cameraId: camera.id,
                        location: camera.location,
                        timestamp: new Date()
                    };
                    console.log(`[FaceDetection] Recognized ${recognitionResult.person?.name} with ${(result.confidence * 100).toFixed(1)}% confidence in ${camera.location}`);
                } else {
                    // Unknown person
                    result = {
                        confidence: recognitionResult.confidence || 0,
                        embedding: embedding,
                        cameraId: camera.id,
                        location: camera.location,
                        timestamp: new Date()
                    };
                    console.log(`[FaceDetection] Unknown person detected with ${(result.confidence * 100).toFixed(1)}% confidence in ${camera.location}`);

                    // Send notification for unknown person
                    const notificationService = require('./notification-service.js').getNotificationService();
                    if (notificationService) {
                        await notificationService.alertUnknownPerson(camera.id, result.confidence);
                    }
                }

                // Store detection result
                await this.storeDetectionResult(result);

                // Update presence
                if (this.presenceDetector && result.personId) {
                    this.presenceDetector.updatePresence({
                        personId: result.personId,
                        cameraId: result.cameraId,
                        location: result.location,
                        confidence: result.confidence,
                        timestamp: result.timestamp
                    });
                }
            }

        } catch (error) {
            console.error('[FaceDetection] Error detecting faces:', error);
        }
    }

    private async storeDetectionResult(result: FaceDetectionResult): Promise<void> {
        // Record in face_detections table
        const stmt = this.db.prepare(`
            INSERT INTO face_detections (person_id, confidence, embedding, camera_id, location, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            result.personId || null,
            result.confidence,
            JSON.stringify(result.embedding),
            result.cameraId,
            result.location,
            result.timestamp.toISOString()
        );

        // Update person's last seen if recognized
        if (result.personId) {
            const updateStmt = this.db.prepare(`
                UPDATE people
                SET last_seen = ?, last_seen_location = ?
                WHERE id = ?
            `);

            updateStmt.run(
                result.timestamp.toISOString(),
                result.location,
                result.personId
            );
        }
    }

    // API method to register a face embedding for a person
    async registerFace(personId: string, imageBuffer: Buffer): Promise<boolean> {
        try {
            // Load image into canvas
            const img = new Image();
            img.src = imageBuffer;

            const cvs = createCanvas(img.width, img.height);
            const ctx = cvs.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Detect single face and extract embedding
            const detection = await faceapi
                .detectSingleFace(cvs)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) {
                console.warn(`[FaceDetection] No face detected in image for ${personId}`);
                return false;
            }

            const embedding = Array.from(detection.descriptor) as number[];
            return await this.recognitionEngine.registerEmbedding(personId, embedding);

        } catch (error) {
            console.error(`[FaceDetection] Error registering face for ${personId}:`, error);
            return false;
        }
    }

    close(): void {
        this.stop();
        this.recognitionEngine.close();
        // DB is managed by centralized database module
    }
}