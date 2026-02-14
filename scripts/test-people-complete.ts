#!/usr/bin/env tsx
/**
 * Complete People Registry Test
 * Starts server and runs all API tests
 */

import express from 'express';
import { PeopleRegistryService } from '../src/server/people-registry.js';

const app = express();
app.use(express.json());

// Create people registry service
const peopleRegistry = new PeopleRegistryService();
app.use('/api', peopleRegistry.getRouter());

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}/api`;

async function apiRequest(url: string, options?: RequestInit): Promise<any> {
    const response = await fetch(url, options);
    return response.json();
}

async function runTests() {
    console.log('🧪 Testing People Registry API...\n');

    try {
        // Test 1: Get all people (should return admin user)
        console.log('1. Getting all people...');
        const people = await apiRequest(`${BASE_URL}/people`);
        console.log(`   Found ${people.length} people:`, people.map((p: any) => p.name));
        console.log('');

        // Test 2: Create a new person
        console.log('2. Creating new person (Test Child)...');
        const newPerson = await apiRequest(`${BASE_URL}/people`, {
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
        console.log('   Created person:', newPerson.name, 'with ID:', newPerson.id);
        const childId = newPerson.id;
        console.log('');

        // Test 3: Get specific person
        console.log('3. Getting specific person...');
        const person = await apiRequest(`${BASE_URL}/people/${childId}`);
        console.log('   Person details:', person.name, person.role);
        console.log('');

        // Test 4: Test permission check
        console.log('4. Testing permission check...');
        const permission = await apiRequest(`${BASE_URL}/people/check-permission`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                personId: childId,
                deviceId: 'tv-living-room',
                action: 'volume-up'
            })
        });
        console.log('   Permission result:', permission.allowed ? 'ALLOWED' : 'DENIED', '-', permission.reason);
        console.log('');

        // Test 5: Record face detection
        console.log('5. Recording face detection...');
        const detection = await apiRequest(`${BASE_URL}/people/${childId}/face-detection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                confidence: 0.95,
                embedding: [0.1, 0.2, 0.3, 0.4, 0.5], // Mock embedding
                cameraId: 'camera-front-door',
                location: 'front-door'
            })
        });
        console.log('   Detection recorded for camera:', detection.cameraId);
        console.log('');

        // Test 6: Get face detection history
        console.log('6. Getting face detection history...');
        const detections = await apiRequest(`${BASE_URL}/people/${childId}/detections`);
        console.log(`   Found ${detections.length} detections`);
        console.log('');

        // Test 7: Update person
        console.log('7. Updating person...');
        const updatedPerson = await apiRequest(`${BASE_URL}/people/${childId}`, {
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
        console.log('   Updated person name to:', updatedPerson.name);
        console.log('');

        // Test 8: Delete person
        console.log('8. Deleting person...');
        const deleteResult = await apiRequest(`${BASE_URL}/people/${childId}`, {
            method: 'DELETE'
        });
        console.log('   Delete result:', deleteResult.success ? 'SUCCESS' : 'FAILED');
        console.log('');

        console.log('✅ All People Registry API tests completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    } finally {
        peopleRegistry.close();
        process.exit(0);
    }
}

// Start server and run tests
const server = app.listen(PORT, async () => {
    console.log(`🧪 People Registry Test Server running on port ${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}/api`);
    console.log('');

    // Wait a moment for server to be ready
    setTimeout(runTests, 1000);
});