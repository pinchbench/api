import Database from 'better-sqlite3';

// Wrapper to make better-sqlite3 look like D1 API for testing
export class MockD1Database {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  prepare(query: string) {
    const stmt = this.db.prepare(query);
    return {
      bind: (...params: any[]) => ({
        first: <T = any>(): T | undefined => {
          try {
            return stmt.get(...params) as T;
          } catch (e) {
            return undefined;
          }
        },
        all: <T = any>(): { results: T[], success: boolean } => {
          try {
            const results = stmt.all(...params) as T[];
            return { results, success: true };
          } catch (e) {
            return { results: [], success: false };
          }
        },
        run: () => {
          try {
            return stmt.run(...params);
          } catch (e) {
            throw e;
          }
        }
      }),
      first: <T = any>(): T | undefined => {
        try {
          return stmt.get() as T;
        } catch (e) {
          return undefined;
        }
      },
      all: <T = any>(): { results: T[], success: boolean } => {
        try {
          const results = stmt.all() as T[];
          return { results, success: true };
        } catch (e) {
          return { results: [], success: false };
        }
      },
      run: () => {
        try {
          return stmt.run();
        } catch (e) {
          throw e;
        }
      }
    };
  }
}