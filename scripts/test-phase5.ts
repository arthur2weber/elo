import Database from 'better-sqlite3';
import { MetricsStore } from '../src/server/metrics-store';
import { BaselineCalculator } from '../src/server/baseline-calculator';
import { TrendAnalyzer } from '../src/server/trend-analyzer';
import { ProactiveSuggestions } from '../src/server/proactive-suggestions';
import { DailyBriefingGenerator } from '../src/server/daily-briefing';

const runPhase5Test = async () => {
  console.log('[Phase 5 Test] Starting Phase 5 component tests...');

  // Create in-memory database for testing
  const db = new Database(':memory:');

  try {
    // Initialize required tables
    console.log('[Phase 5 Test] Initializing database tables...');
    db.exec(`
      CREATE TABLE device_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT,
        timestamp DATETIME NOT NULL,
        metadata TEXT
      );

      CREATE TABLE proactive_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        type TEXT NOT NULL,
        priority TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        recommendations TEXT NOT NULL,
        estimated_effort TEXT,
        potential_impact TEXT,
        confidence INTEGER,
        based_on_data TEXT,
        suggested_actions TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        status TEXT DEFAULT 'active'
      );
    `);

    // Initialize Phase 5 components
    console.log('[Phase 5 Test] Initializing components...');
    const metricsStore = new MetricsStore(db);
    const baselineCalculator = new BaselineCalculator(metricsStore, db);
    const trendAnalyzer = new TrendAnalyzer(metricsStore, db);
    const proactiveSuggestions = new ProactiveSuggestions(trendAnalyzer, baselineCalculator, metricsStore, db);
    const dailyBriefingGenerator = new DailyBriefingGenerator(
      proactiveSuggestions,
      metricsStore,
      trendAnalyzer,
      baselineCalculator,
      db
    );

    console.log('[Phase 5 Test] ✅ All Phase 5 components initialized successfully!');

  } catch (error) {
    console.error('[Phase 5 Test] ❌ Test failed:', error);
    throw error;
  } finally {
    db.close();
  }
};

runPhase5Test().catch((error) => {
  console.error('Phase 5 test failed:', error);
  process.exit(1);
});