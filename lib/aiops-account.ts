import { randomBytes } from "node:crypto";
import { createUser, findUserByUsername, type AuthUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const AIOPS_USERNAME = "aiops";
export const RESERVED_USERNAMES = new Set([AIOPS_USERNAME, "ops-api"]);

export function isReservedUsername(username: string) {
  return RESERVED_USERNAMES.has(username.trim().toLowerCase());
}

export function isAiopsUser(user: { username: string } | null | undefined) {
  return user?.username === AIOPS_USERNAME;
}

function unusablePasswordHash() {
  return `${randomBytes(16).toString("hex")}:${randomBytes(64).toString("hex")}`;
}

export function ensureAiopsUser(): AuthUser {
  const db = getDb();
  const existing = findUserByUsername(AIOPS_USERNAME);
  if (existing) {
    db.prepare("UPDATE users SET kind = 'service' WHERE id = ?").run(existing.id);
    return { id: existing.id, username: existing.username };
  }
  const user = createUser(AIOPS_USERNAME, unusablePasswordHash(), "service");
  return user;
}

export function aiopsActor() {
  const user = ensureAiopsUser();
  return { ...user, kind: "service" as const };
}
