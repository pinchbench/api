import { beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { initDbFromSchema } from './schema-loader';

// Setup global test database
let db: Database.Database;

beforeAll(async () => {
  // Create an in-memory SQLite database for testing
  db = new Database(':memory:');

  // Initialize schema from the shared SQL schema file
  initDbFromSchema(db);

  // Make db available globally for tests
  (globalThis as any).testDb = db;
});

afterAll(async () => {
  if (db) {
    db.close();
  }
});