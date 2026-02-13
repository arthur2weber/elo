import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'elo.db');

function maintainDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('Database not found, nothing to maintain');
    return;
  }

  const db = new Database(DB_PATH);

  try {
    console.log('Starting database maintenance...');

    // Run integrity check
    console.log('Checking database integrity...');
    const integrity = db.pragma('integrity_check') as { integrity_check: string }[];
    if (integrity[0].integrity_check !== 'ok') {
      console.error('Database integrity check failed:', integrity);
      return;
    }
    console.log('✓ Database integrity OK');

    // Analyze tables for query optimization
    console.log('Analyzing tables...');
    db.exec('ANALYZE');
    console.log('✓ Tables analyzed');

    // Vacuum to reclaim space and defragment
    console.log('Vacuuming database...');
    db.exec('VACUUM');
    console.log('✓ Database vacuumed');

    // Rebuild indexes
    console.log('Rebuilding indexes...');
    const tables = ['devices', 'events', 'requests', 'suggestions', 'ai_usage', 'drivers'];
    for (const table of tables) {
      db.exec(`REINDEX ${table}`);
    }
    console.log('✓ Indexes rebuilt');

    // Optional: Clean old data (keep last 30 days for events, 90 days for others)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    console.log('Cleaning old data...');

    // Clean old events (keep last 30 days)
    const eventsDeleted = db.prepare('DELETE FROM events WHERE timestamp < ?').run(thirtyDaysAgo);
    console.log(`✓ Deleted ${eventsDeleted.changes} old events`);

    // Clean old requests (keep last 90 days)
    const requestsDeleted = db.prepare('DELETE FROM requests WHERE timestamp < ?').run(ninetyDaysAgo);
    console.log(`✓ Deleted ${requestsDeleted.changes} old requests`);

    // Clean old AI usage (keep last 90 days)
    const aiUsageDeleted = db.prepare('DELETE FROM ai_usage WHERE timestamp < ?').run(ninetyDaysAgo);
    console.log(`✓ Deleted ${aiUsageDeleted.changes} old AI usage records`);

    // Clean old suggestions (keep only non-pending, older than 90 days)
    const suggestionsDeleted = db.prepare(`
      DELETE FROM suggestions
      WHERE status != 'PENDING' AND created_at < ?
    `).run(ninetyDaysAgo);
    console.log(`✓ Deleted ${suggestionsDeleted.changes} old suggestions`);

    // Final vacuum after cleanup
    console.log('Final vacuum after cleanup...');
    db.exec('VACUUM');
    console.log('✓ Final vacuum completed');

    // Show stats
    const stats = db.prepare(`
      SELECT
        'devices' as table_name, COUNT(*) as count FROM devices
      UNION ALL
      SELECT 'events', COUNT(*) FROM events
      UNION ALL
      SELECT 'requests', COUNT(*) FROM requests
      UNION ALL
      SELECT 'suggestions', COUNT(*) FROM suggestions
      UNION ALL
      SELECT 'ai_usage', COUNT(*) FROM ai_usage
      UNION ALL
      SELECT 'drivers', COUNT(*) FROM drivers
    `).all();

    console.log('\nDatabase statistics:');
    stats.forEach((stat: any) => {
      console.log(`  ${stat.table_name}: ${stat.count} records`);
    });

    console.log('\n✓ Database maintenance completed successfully');

  } catch (error) {
    console.error('Error during maintenance:', error);
  } finally {
    db.close();
  }
}

maintainDatabase();