import { describe, it, expect, beforeEach } from 'vitest';
import { appendDecision, readDecisions, shouldAutoApprove, buildPreferenceStats } from '../src/cli/utils/preferences';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

describe('Preferences', () => {
  const TEST_DB_PATH = path.join(process.cwd(), 'data', 'elo-test-preferences.db');

  const getTestDb = () => new Database(TEST_DB_PATH);

  beforeEach(() => {
    // Set test database path
    process.env.ELO_DB_PATH = TEST_DB_PATH;
    
    // Clean test database before each test
    try {
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
    } catch (e) {
      // Ignore errors if file doesn't exist or can't be deleted
    }

    // Create fresh database with decisions table
    const db = getTestDb();
    try {
      db.exec(`
        CREATE TABLE decisions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME NOT NULL,
          user TEXT,
          context TEXT,
          action_key TEXT,
          suggestion TEXT,
          accepted BOOLEAN DEFAULT 0,
          status TEXT,
          details TEXT,
          request_id INTEGER
        )
      `);
    } finally {
      db.close();
    }
  });

  it('should append and read decisions', async () => {
    const decision = {
      timestamp: new Date().toISOString(),
      user: 'test-user',
      context: 'test context',
      actionKey: 'tv=turnOn',
      suggestion: 'Turn on TV at 8 PM',
      accepted: true,
      status: 'APPROVED' as const,
      details: { reason: 'user approved' }
    };

    await appendDecision(decision);
    const decisions = await readDecisions();

    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      user: 'test-user',
      actionKey: 'tv=turnOn',
      accepted: true,
      status: 'APPROVED'
    });
  });

  it('should auto-approve based on decision history', async () => {
    const actionKey = 'tv=turnOn';

    // Add 3 accepted decisions (should trigger auto-approve)
    for (let i = 0; i < 3; i++) {
      await appendDecision({
        timestamp: new Date().toISOString(),
        user: 'test-user',
        context: 'test context',
        actionKey: actionKey,
        suggestion: `Suggestion ${i}`,
        accepted: true,
        status: 'APPROVED' as const,
        details: {}
      });
    }

    const decisions = await readDecisions();
    const stats = buildPreferenceStats(decisions);
    const shouldApprove = shouldAutoApprove(actionKey, stats);
    expect(shouldApprove).toBe(true);
  });

  it('should not auto-approve with insufficient accepted decisions', async () => {
    const actionKey = 'tv=turnOn';

    // Add only 2 accepted decisions (below threshold)
    for (let i = 0; i < 2; i++) {
      await appendDecision({
        timestamp: new Date().toISOString(),
        user: 'test-user',
        context: 'test context',
        actionKey: actionKey,
        suggestion: `Suggestion ${i}`,
        accepted: true,
        status: 'APPROVED' as const,
        details: {}
      });
    }

    const decisions = await readDecisions();
    const stats = buildPreferenceStats(decisions);
    const shouldApprove = shouldAutoApprove(actionKey, stats);
    expect(shouldApprove).toBe(false);
  });

  it('should not auto-approve with low acceptance rate', async () => {
    const actionKey = 'tv=turnOn';

    // Add 3 decisions: 2 accepted, 1 rejected (66% rate, below 70% threshold)
    await appendDecision({
      timestamp: new Date().toISOString(),
      user: 'test-user',
      context: 'test context',
      actionKey: actionKey,
      suggestion: 'Suggestion 1',
      accepted: true,
      status: 'APPROVED' as const,
      details: {}
    });

    await appendDecision({
      timestamp: new Date().toISOString(),
      user: 'test-user',
      context: 'test context',
      actionKey: actionKey,
      suggestion: 'Suggestion 2',
      accepted: true,
      status: 'APPROVED' as const,
      details: {}
    });

    await appendDecision({
      timestamp: new Date().toISOString(),
      user: 'test-user',
      context: 'test context',
      actionKey: actionKey,
      suggestion: 'Suggestion 3',
      accepted: false,
      status: 'REJECTED' as const,
      details: {}
    });

    const decisions = await readDecisions();
    const stats = buildPreferenceStats(decisions);
    const shouldApprove = shouldAutoApprove(actionKey, stats);
    expect(shouldApprove).toBe(false);
  });

  it('should build preference stats correctly', async () => {
    const actionKey = 'tv=turnOn';

    // Add some decisions
    await appendDecision({
      timestamp: new Date().toISOString(),
      user: 'test-user',
      context: 'test context',
      actionKey: actionKey,
      suggestion: 'Turn on TV',
      accepted: true,
      status: 'APPROVED' as const,
      details: {}
    });

    await appendDecision({
      timestamp: new Date().toISOString(),
      user: 'test-user',
      context: 'different context',
      actionKey: actionKey,
      suggestion: 'Turn on TV again',
      accepted: true,
      status: 'APPROVED' as const,
      details: {}
    });

    const decisions = await readDecisions();
    const stats = buildPreferenceStats(decisions);

    expect(stats.has(actionKey)).toBe(true);
    const actionStats = stats.get(actionKey)!;
    expect(actionStats.accepted).toBe(2);
    expect(actionStats.total).toBe(2);
  });
});