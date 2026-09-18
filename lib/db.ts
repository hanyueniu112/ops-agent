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
      created_at INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'human'
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

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER,
      revoked_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_jobs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      reply TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      result_json TEXT NOT NULL DEFAULT '{}',
      base_messages_json TEXT NOT NULL DEFAULT '[]',
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_jobs_session ON chat_jobs(session_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(token_hash);
  `);
  return db;
}

function columnNames(db: DatabaseSync, table: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function ensureSchema(db: DatabaseSync) {
  const userCols = columnNames(db, "users");
  if (userCols.size > 0 && !userCols.has("kind")) {
    db.exec("ALTER TABLE users ADD COLUMN kind TEXT NOT NULL DEFAULT 'human'");
  }
  const jobCols = columnNames(db, "chat_jobs");
  if (jobCols.size > 0 && !jobCols.has("base_messages_json")) {
    db.exec("ALTER TABLE chat_jobs ADD COLUMN base_messages_json TEXT NOT NULL DEFAULT '[]'");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER,
      revoked_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_jobs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      reply TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      result_json TEXT NOT NULL DEFAULT '{}',
      base_messages_json TEXT NOT NULL DEFAULT '[]',
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_jobs_session ON chat_jobs(session_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(token_hash);
  `);
}

export function getDb() {
  const globalDb = globalThis as GlobalDb;
  if (!globalDb.__opsSqlite) {
    globalDb.__opsSqlite = openDb();
  }
  ensureSchema(globalDb.__opsSqlite);
  return globalDb.__opsSqlite;
}
