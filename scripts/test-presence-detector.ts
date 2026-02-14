#!/usr/bin/env tsx
/**
 * Test Presence Detector
 * Tests the presence detection functionality
 */

import { initPresenceDetector, getPresenceDetector } from '../src/server/presence-detector.js';

async function testPresenceDetector() {
    console.log('🧭 Testing Presence Detector...\n');

    try {
        // Initialize presence detector
        const presenceDetector = initPresenceDetector();

        // Simulate some face detections
        console.log('1. Simulating face detections...');

        // Arthur in living room
        presenceDetector.updatePresence({
            personId: 'admin-arthur',
            cameraId: 'camera-living-room',
            location: 'living-room',
            confidence: 0.92,
            timestamp: new Date()
        });

        // Lucca in bedroom
        presenceDetector.updatePresence({
            personId: 'person-lucca',
            cameraId: 'camera-bedroom',
            location: 'bedroom',
            confidence: 0.88,
            timestamp: new Date()
        });

        // Arthur again (should update location)
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        presenceDetector.updatePresence({
            personId: 'admin-arthur',
            cameraId: 'camera-kitchen',
            location: 'kitchen',
            confidence: 0.95,
            timestamp: new Date()
        });

        console.log('2. Getting presence summary...');
        const summary = presenceDetector.getPresenceSummary();
        console.log('   Summary:', JSON.stringify(summary, null, 2));

        console.log('3. Checking individual presence...');
        const arthurPresent = presenceDetector.isPersonPresent('admin-arthur');
        const luccaPresent = presenceDetector.isPersonPresent('person-lucca');
        const unknownPresent = presenceDetector.isPersonPresent('unknown-person');

        console.log('   Arthur present:', arthurPresent);
        console.log('   Lucca present:', luccaPresent);
        console.log('   Unknown present:', unknownPresent);

        console.log('4. Getting people in locations...');
        const livingRoomPeople = presenceDetector.getPeopleInLocation('living-room');
        const kitchenPeople = presenceDetector.getPeopleInLocation('kitchen');
        const bedroomPeople = presenceDetector.getPeopleInLocation('bedroom');

        console.log('   Living room:', livingRoomPeople.map(p => p.personName));
        console.log('   Kitchen:', kitchenPeople.map(p => p.personName));
        console.log('   Bedroom:', bedroomPeople.map(p => p.personName));

        console.log('5. Getting all present people...');
        const allPresent = presenceDetector.getPresentPeople();
        console.log('   Present people:', allPresent.map(p => `${p.personName} (${p.location})`));

        console.log('\n✅ Presence Detector test completed!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run test if called directly
if (require.main === module) {
    testPresenceDetector();
}

export { testPresenceDetector };