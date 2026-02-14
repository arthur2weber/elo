import { getLocalDb, getKnowledgeDb, closeAllDatabases, getLocalDbPath, getKnowledgeDbPath } from '../src/server/database';

async function initDatabase() {
  // Just calling getLocalDb() and getKnowledgeDb() will create the databases
  // and initialize all schemas automatically via the database module.
  const localDb = getLocalDb();
  const knowledgeDb = getKnowledgeDb();

  console.log('Database initialized successfully:');
  console.log(`  📚 Knowledge DB: ${getKnowledgeDbPath()}`);
  console.log(`  🔒 Local DB:     ${getLocalDbPath()}`);
  
  closeAllDatabases();
}

initDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});