#!/usr/bin/env tsx
/**
 * Test People Registry API
 * Tests the CRUD operations for people management
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api';

async function testPeopleAPI() {
    console.log('🧪 Testing People Registry API...\n');

    try {
        // Test 1: Get all people (should return admin user)
        console.log('1. Getting all people...');
        const getResponse = await fetch(`${BASE_URL}/people`);
        const people = await getResponse.json();
        console.log(`   Found ${people.length} people:`, people.map((p: any) => p.name));
        console.log('');

        // Test 2: Create a new person
        console.log('2. Creating new person (Test Child)...');
        const createResponse = await fetch(`${BASE_URL}/people`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test Child',
                role: 'child',
                restrictions: {
                    blockedDevices: ['tv-living-room'],
                    blockedActions: ['volume-up'],
                    timeLimits: [{
                        start: '20:00',
                        end: '06:00',
                        days: [1, 2, 3, 4, 5] // Monday to Friday
                    }],
                    allowedAreas: ['bedroom', 'living-room']
                }
            })
        });
        const newPerson = await createResponse.json();
        console.log('   Created person:', newPerson.name, 'with ID:', newPerson.id);
        const childId = newPerson.id;
        console.log('');

        // Test 3: Get specific person
        console.log('3. Getting specific person...');
        const getOneResponse = await fetch(`${BASE_URL}/people/${childId}`);
        const person = await getOneResponse.json();
        console.log('   Person details:', person.name, person.role);
        console.log('');

        // Test 4: Test permission check
        console.log('4. Testing permission check...');
        const permissionResponse = await fetch(`${BASE_URL}/people/check-permission`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                personId: childId,
                deviceId: 'tv-living-room',
                action: 'volume-up'
            })
        });
        const permission = await permissionResponse.json();
        console.log('   Permission result:', permission.allowed ? 'ALLOWED' : 'DENIED', '-', permission.reason);
        console.log('');

        // Test 5: Record face detection
        console.log('5. Recording face detection...');
        const detectionResponse = await fetch(`${BASE_URL}/people/${childId}/face-detection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                confidence: 0.95,
                embedding: [0.1, 0.2, 0.3, 0.4, 0.5], // Mock embedding
                cameraId: 'camera-front-door',
                location: 'front-door'
            })
        });
        const detection = await detectionResponse.json();
        console.log('   Detection recorded for camera:', detection.cameraId);
        console.log('');

        // Test 6: Get face detection history
        console.log('6. Getting face detection history...');
        const historyResponse = await fetch(`${BASE_URL}/people/${childId}/detections`);
        const detections = await historyResponse.json();
        console.log(`   Found ${detections.length} detections`);
        console.log('');

        // Test 7: Update person
        console.log('7. Updating person...');
        const updateResponse = await fetch(`${BASE_URL}/people/${childId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Updated Test Child',
                restrictions: {
                    ...person.restrictions,
                    blockedDevices: ['tv-living-room', 'speaker-kitchen']
                }
            })
        });
        const updatedPerson = await updateResponse.json();
        console.log('   Updated person name to:', updatedPerson.name);
        console.log('');

        // Test 8: Delete person
        console.log('8. Deleting person...');
        const deleteResponse = await fetch(`${BASE_URL}/people/${childId}`, {
            method: 'DELETE'
        });
        const deleteResult = await deleteResponse.json();
        console.log('   Delete result:', deleteResult.success ? 'SUCCESS' : 'FAILED');
        console.log('');

        console.log('✅ All People Registry API tests completed!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run test if called directly
if (require.main === module) {
    testPeopleAPI();
}

export { testPeopleAPI };