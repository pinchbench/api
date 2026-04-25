import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const loadSchemaSql = (): string => {
  return fs.readFileSync(join(__dirname, '../schema.sql'), 'utf8');
};

export const initDbFromSchema = (db: Database.Database): void => {
  db.exec(loadSchemaSql());
};
