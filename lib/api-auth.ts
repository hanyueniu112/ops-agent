import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { aiopsActor, ensureAiopsUser } from "@/lib/aiops-account";
import { findUserById, readBearerToken, userFromRequest, userFromToken, type AuthUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export type ApiActor = AuthUser & { kind: "user" | "service" };

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function envApiKey() {
  return process.env.AIOPS_API_KEY?.trim() || process.env.OPS_API_KEY?.trim() || "";
}

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  token_hash: string;
  user_id: string;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
};

function lookupStoredKey(token: string) {
  const row = getDb()
    .prepare(
      `SELECT id, name, prefix, token_hash, user_id, created_at, last_used_at, revoked_at
       FROM api_keys WHERE token_hash = ?`,
    )
    .get(sha256(token)) as ApiKeyRow | undefined;
  if (!row || row.revoked_at) return null;
  getDb().prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(Date.now(), row.id);
  return row;
}

export function actorFromRequest(req: Request): ApiActor | null {
  const bearer = readBearerToken(req);
  if (bearer) {
    const envKey = envApiKey();
    if (envKey && safeEqual(bearer, envKey)) {
      return aiopsActor();
    }
    const stored = lookupStoredKey(bearer);
    if (stored) {
      const user = findUserById(stored.user_id) || ensureAiopsUser();
      return { ...user, kind: "service" };
    }
    const fromLogin = userFromToken(bearer);
    if (fromLogin) return { ...fromLogin, kind: "user" };
  }

  const user = userFromRequest(req);
  return user ? { ...user, kind: "user" } : null;
}

export function requireActor(req: Request) {
  return actorFromRequest(req);
}

/** 北向业务接口固定用 aiops，调用方不用传 Token。 */
export function northboundActor() {
  return aiopsActor();
}

export function listApiKeys() {
  return getDb()
    .prepare(
      `SELECT id, name, prefix, created_at, last_used_at, revoked_at
       FROM api_keys
       WHERE revoked_at IS NULL
       ORDER BY created_at DESC`,
    )
    .all() as Array<{
    id: string;
    name: string;
    prefix: string;
    created_at: number;
    last_used_at: number | null;
    revoked_at: number | null;
  }>;
}

export function issueApiKey(name: string, userId: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("需要填写密钥名称");
  const raw = `ops_${randomBytes(24).toString("hex")}`;
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO api_keys (id, name, prefix, token_hash, user_id, created_at, last_used_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
    )
    .run(id, trimmed, raw.slice(0, 12), sha256(raw), userId, Date.now());
  return { id, name: trimmed, prefix: raw.slice(0, 12), key: raw };
}

export function revokeApiKey(id: string) {
  const result = getDb()
    .prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
    .run(Date.now(), id);
  return result.changes > 0;
}

export function apiKeyConfigured() {
  return Boolean(envApiKey()) || listApiKeys().length > 0;
}
