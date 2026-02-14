#!/usr/bin/env tsx
/**
 * Test People Registry Standalone
 * Tests the people registry service in isolation
 */

import express from 'express';
import { PeopleRegistryService } from '../src/server/people-registry.js';

const app = express();
app.use(express.json());

// Create people registry service
const peopleRegistry = new PeopleRegistryService();
app.use('/api', peopleRegistry.getRouter());

const PORT = 3001;

app.listen(PORT, () => {
    console.log(`🧪 People Registry Test Server running on port ${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}/api`);
});

export { app };