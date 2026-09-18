import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { AUTH_COOKIE } from "@/lib/auth-cookie";
import { getDb } from "@/lib/db";

const scrypt = promisify(scryptCb);
export { AUTH_COOKIE };
const TOKEN_DAYS = 30;

export type AuthUser = {
  id: string;
  username: string;
};

function tokenExpiry() {
  return Date.now() + TOKEN_DAYS * 24 * 60 * 60 * 1000;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function normalizeUsername(raw: string) {
  return raw.trim();
}

export function validateUsername(username: string) {
  if (username.length < 2 || username.length > 32) return "用户名长度 2–32 个字符";
  if (!/^[\w\u4e00-\u9fa5-]+$/.test(username)) return "用户名只能用中文、字母、数字、下划线和连字符";
  return "";
}

export function validatePassword(password: string) {
  if (password.length < 6) return "密码至少 6 位";
  if (password.length > 72) return "密码过长";
  return "";
}

export function createUser(username: string, passwordHash: string): AuthUser {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
  ).run(id, username, passwordHash, Date.now());
  return { id, username };
}

export function findUserByUsername(username: string) {
  const row = getDb()
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
    .get(username) as { id: string; username: string; password_hash: string } | undefined;
  return row || null;
}

export function issueToken(userId: string) {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  db.prepare(
    "INSERT INTO auth_tokens (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run(token, userId, now, tokenExpiry());
  return token;
}

export function revokeToken(token: string) {
  getDb().prepare("DELETE FROM auth_tokens WHERE token = ?").run(token);
}

export function userFromToken(token: string): AuthUser | null {
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT users.id AS id, users.username AS username, auth_tokens.expires_at AS expires_at
       FROM auth_tokens
       JOIN users ON users.id = auth_tokens.user_id
       WHERE auth_tokens.token = ?`,
    )
    .get(token) as { id: string; username: string; expires_at: number } | undefined;
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) {
    revokeToken(token);
    return null;
  }
  return { id: row.id, username: row.username };
}

export function readTokenFromRequest(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export function userFromRequest(req: Request) {
  return userFromToken(readTokenFromRequest(req));
}

export function cookieHeader(token: string, maxAgeSeconds = TOKEN_DAYS * 24 * 60 * 60) {
  const parts = [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearCookieHeader() {
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
