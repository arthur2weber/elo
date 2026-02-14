#!/usr/bin/env tsx
/**
 * Test Face Recognition Engine
 * Tests the face recognition engine functionality
 */

import { FaceRecognitionEngine } from '../src/server/face-recognition-engine.js';

async function testFaceRecognitionEngine() {
    console.log('🧪 Testing Face Recognition Engine...\n');

    const engine = new FaceRecognitionEngine();

    try {
        // Test 1: Get initial stats
        console.log('1. Getting initial stats...');
        const initialStats = engine.getStats();
        console.log('   Stats:', initialStats);
        console.log('');

        // Test 2: Register embeddings for Arthur
        console.log('2. Registering embeddings for Arthur...');
        const mockEmbedding1 = Array.from({ length: 128 }, () => Math.random() - 0.5);
        const mockEmbedding2 = Array.from({ length: 128 }, () => Math.random() - 0.5);

        const success1 = await engine.registerEmbedding('admin-arthur', mockEmbedding1);
        const success2 = await engine.registerEmbedding('admin-arthur', mockEmbedding2);

        console.log(`   Registered embedding 1: ${success1 ? 'SUCCESS' : 'FAILED'}`);
        console.log(`   Registered embedding 2: ${success2 ? 'SUCCESS' : 'FAILED'}`);
        console.log('');

        // Test 3: Get updated stats
        console.log('3. Getting updated stats...');
        const updatedStats = engine.getStats();
        console.log('   Stats:', updatedStats);
        console.log('');

        // Test 4: Test recognition with registered embedding
        console.log('4. Testing recognition with registered embedding...');
        const recognition1 = await engine.recognizeFace(mockEmbedding1);
        console.log('   Recognition result:', {
            personId: recognition1.personId,
            confidence: recognition1.confidence.toFixed(3),
            personName: recognition1.person?.name
        });
        console.log('');

        // Test 5: Test recognition with similar embedding
        console.log('5. Testing recognition with similar embedding...');
        const similarEmbedding = mockEmbedding1.map(x => x + (Math.random() - 0.5) * 0.1); // Add small noise
        const recognition2 = await engine.recognizeFace(similarEmbedding);
        console.log('   Recognition result:', {
            personId: recognition2.personId,
            confidence: recognition2.confidence.toFixed(3),
            personName: recognition2.person?.name
        });
        console.log('');

        // Test 6: Test recognition with unknown embedding
        console.log('6. Testing recognition with unknown embedding...');
        const unknownEmbedding = Array.from({ length: 128 }, () => Math.random() - 0.5);
        const recognition3 = await engine.recognizeFace(unknownEmbedding);
        console.log('   Recognition result:', {
            personId: recognition3.personId,
            confidence: recognition3.confidence.toFixed(3)
        });
        console.log('');

        console.log('✅ Face Recognition Engine test completed!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        engine.close();
    }
}

// Run test if called directly
if (require.main === module) {
    testFaceRecognitionEngine();
}

export { testFaceRecognitionEngine };