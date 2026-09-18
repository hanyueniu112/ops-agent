import { DatabaseSync } from "node:sqlite";
import { sqlitePath } from "@/lib/data-dir";

type GlobalDb = typeof globalThis & { __opsSqlite?: DatabaseSync };

function openDb() {
  const db = new DatabaseSync(sqlitePath());
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      visibility TEXT NOT NULL CHECK (visibility IN ('public', 'personal')),
      owner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      messages_json TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_visibility ON sessions(visibility, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_owner ON sessions(owner_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);

    CREATE TABLE IF NOT EXISTS dream_runs (
      id TEXT PRIMARY KEY,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      phase TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      summary TEXT NOT NULL DEFAULT '',
      diary TEXT NOT NULL DEFAULT '',
      candidates_json TEXT NOT NULL DEFAULT '[]'
    );
  `);
  return db;
}

export function getDb() {
  const globalDb = globalThis as GlobalDb;
  if (!globalDb.__opsSqlite) {
    globalDb.__opsSqlite = openDb();
  }
  return globalDb.__opsSqlite;
}
