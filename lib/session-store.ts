import type { UIMessage } from "ai";
import { getDb } from "@/lib/db";

export type SessionVisibility = "public" | "personal";

export type StoredSession = {
  id: string;
  title: string;
  visibility: SessionVisibility;
  ownerId: string;
  ownerName: string;
  createdAt: number;
  updatedAt: number;
  messages: UIMessage[];
};

type SessionRow = {
  id: string;
  title: string;
  visibility: SessionVisibility;
  owner_id: string;
  owner_name: string;
  created_at: number;
  updated_at: number;
  messages_json: string;
};

function parseMessages(raw: string): UIMessage[] {
  try {
    const parsed = JSON.parse(raw) as UIMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapSession(row: SessionRow, includeMessages: boolean): StoredSession {
  return {
    id: row.id,
    title: row.title,
    visibility: row.visibility,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    messages: includeMessages ? parseMessages(row.messages_json) : [],
  };
}

export function canAccessSession(session: { visibility: SessionVisibility; ownerId: string }, userId: string) {
  return session.visibility === "public" || session.ownerId === userId;
}

export function listVisibleSessions(userId: string): StoredSession[] {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.title, s.visibility, s.owner_id, u.username AS owner_name,
              s.created_at, s.updated_at, '[]' AS messages_json
       FROM sessions s
       JOIN users u ON u.id = s.owner_id
       WHERE s.visibility = 'public' OR s.owner_id = ?
       ORDER BY s.updated_at DESC`,
    )
    .all(userId) as SessionRow[];
  return rows.map((row) => mapSession(row, false));
}

export function getStoredSession(id: string) {
  const row = getDb()
    .prepare(
      `SELECT s.id, s.title, s.visibility, s.owner_id, u.username AS owner_name,
              s.created_at, s.updated_at, s.messages_json
       FROM sessions s
       JOIN users u ON u.id = s.owner_id
       WHERE s.id = ?`,
    )
    .get(id) as SessionRow | undefined;
  return row ? mapSession(row, true) : null;
}

export function createStoredSession(input: {
  id?: string;
  userId: string;
  username: string;
  visibility: SessionVisibility;
  title?: string;
  messages?: UIMessage[];
}): StoredSession {
  const db = getDb();
  const id = input.id || crypto.randomUUID();
  const now = Date.now();
  const title = input.title?.trim() || "新任务";
  const messages = input.messages || [];
  db.prepare(
    `INSERT INTO sessions (id, visibility, owner_id, title, created_at, updated_at, messages_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.visibility, input.userId, title, now, now, JSON.stringify(messages));
  return {
    id,
    title,
    visibility: input.visibility,
    ownerId: input.userId,
    ownerName: input.username,
    createdAt: now,
    updatedAt: now,
    messages,
  };
}

export function updateStoredSession(
  id: string,
  patch: { title?: string; messages?: UIMessage[]; visibility?: SessionVisibility },
) {
  const current = getStoredSession(id);
  if (!current) return null;
  const title = patch.title?.trim() || current.title;
  const messages = patch.messages ?? current.messages;
  const visibility = patch.visibility || current.visibility;
  const now = Date.now();
  getDb()
    .prepare(
      `UPDATE sessions
       SET title = ?, visibility = ?, messages_json = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(title, visibility, JSON.stringify(messages), now, id);
  return getStoredSession(id);
}

export function lastPublicSessionUpdate() {
  const row = getDb()
    .prepare("SELECT MAX(updated_at) AS updated_at FROM sessions WHERE visibility = 'public'")
    .get() as { updated_at: number | null } | undefined;
  return Number(row?.updated_at || 0);
}

export function listPublicSessionsForDream(lookbackMs = 7 * 24 * 60 * 60 * 1000, limit = 24) {
  const since = Date.now() - lookbackMs;
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.title, s.visibility, s.owner_id, u.username AS owner_name,
              s.created_at, s.updated_at, s.messages_json
       FROM sessions s
       JOIN users u ON u.id = s.owner_id
       WHERE s.visibility = 'public' AND s.updated_at >= ?
       ORDER BY s.updated_at DESC
       LIMIT ?`,
    )
    .all(since, limit) as SessionRow[];
  return rows.map((row) => mapSession(row, true));
}

export function deleteStoredSession(id: string) {
  const result = getDb().prepare("DELETE FROM sessions WHERE id = ?").run(id);
  return result.changes > 0;
}
