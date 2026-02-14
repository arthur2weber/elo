#!/usr/bin/env tsx
/**
 * Test Face Detection Worker
 * Tests the face detection worker functionality
 */

import { FaceDetectionWorker } from '../src/server/face-detection-worker.js';

async function testFaceDetectionWorker() {
    console.log('🧪 Testing Face Detection Worker...\n');

    const worker = new FaceDetectionWorker();

    try {
        // Initialize worker
        console.log('1. Initializing worker...');
        await worker.initialize();
        console.log('   ✅ Worker initialized\n');

        // Start worker
        console.log('2. Starting worker...');
        await worker.start();
        console.log('   ✅ Worker started (will run for 30 seconds)\n');

        // Wait for some detections
        console.log('3. Waiting for face detections...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Stop worker
        console.log('4. Stopping worker...');
        await worker.stop();
        console.log('   ✅ Worker stopped\n');

        console.log('✅ Face Detection Worker test completed!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        worker.close();
    }
}

// Run test if called directly
if (require.main === module) {
    testFaceDetectionWorker();
}

export { testFaceDetectionWorker };