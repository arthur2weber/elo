// Test setup file for Vitest
import { beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Create test database path
const TEST_DB_PATH = path.join(process.cwd(), 'data', 'elo-test.db');

// Setup test database before all tests
beforeAll(async () => {
  // Ensure data directory exists
  const dataDir = path.dirname(TEST_DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Remove existing test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  // Set environment variable for test database
  process.env.ELO_TEST_DB_PATH = TEST_DB_PATH;
});

// Cleanup after all tests
afterAll(async () => {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});