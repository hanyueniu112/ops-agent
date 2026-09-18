import type { UIMessage } from "ai";

export type SessionVisibility = "public" | "personal";

export type AgentSession = {
  id: string;
  title: string;
  visibility: SessionVisibility;
  ownerId: string;
  ownerName: string;
  createdAt: number;
  updatedAt: number;
  messages: UIMessage[];
};

export type AuthUser = {
  id: string;
  username: string;
};

const LAST_KEY = "ops-last-session";
const MIGRATED_KEY = "ops-sessions-migrated";

export function sessionPath(id: string) {
  return `/s/${id}`;
}

export function createSessionId() {
  return crypto.randomUUID();
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (response.status === 401 && typeof window !== "undefined") {
    const next = window.location.pathname + window.location.search;
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
  }
  if (!response.ok) {
    throw new Error(data.error || `请求失败 ${response.status}`);
  }
  return data;
}

export async function fetchMe() {
  const data = await parseJson<{ user: AuthUser }>(await fetch("/api/auth", { cache: "no-store" }));
  return data.user;
}

export async function logoutUser() {
  await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "logout" }),
  });
}

export async function listSessions() {
  const data = await parseJson<{ sessions: AgentSession[] }>(
    await fetch("/api/sessions", { cache: "no-store" }),
  );
  return data.sessions;
}

export async function getSession(id: string) {
  const data = await parseJson<{ session: AgentSession }>(
    await fetch(`/api/sessions/${encodeURIComponent(id)}`, { cache: "no-store" }),
  );
  return data.session;
}

export async function createSession(input: {
  visibility: SessionVisibility;
  id?: string;
  title?: string;
  messages?: UIMessage[];
}) {
  const data = await parseJson<{ session: AgentSession }>(
    await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  rememberSession(data.session.id);
  return data.session;
}

const saveTimers = new Map<string, number>();

export function saveSessionMessages(id: string, messages: UIMessage[], title?: string) {
  if (!id || messages.length === 0) return;
  const previous = saveTimers.get(id);
  if (previous) window.clearTimeout(previous);
  const timer = window.setTimeout(() => {
    saveTimers.delete(id);
    void fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, title }),
    });
  }, 400);
  saveTimers.set(id, timer);
}

export async function flushSessionSave(id: string, messages: UIMessage[], title?: string) {
  const previous = saveTimers.get(id);
  if (previous) window.clearTimeout(previous);
  saveTimers.delete(id);
  if (!id || messages.length === 0) return;
  await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, title }),
  });
}

export async function updateSessionVisibility(id: string, visibility: SessionVisibility) {
  const data = await parseJson<{ session: AgentSession }>(
    await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    }),
  );
  return data.session;
}

export async function deleteSession(id: string) {
  await parseJson<{ ok: boolean }>(
    await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  );
}

export function rememberSession(id: string) {
  if (!id) return;
  localStorage.setItem(LAST_KEY, id);
}

export function lastRememberedSession() {
  return localStorage.getItem(LAST_KEY) || "";
}

export async function migrateLegacySessions() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATED_KEY)) return;
  try {
    const raw = localStorage.getItem("weave-agent-sessions");
    const list = raw ? (JSON.parse(raw) as Array<{ id: string; title?: string }>) : [];
    for (const item of list) {
      if (!item?.id) continue;
      const messageRaw = localStorage.getItem(`weave-agent-messages:${item.id}`);
      const messages = messageRaw ? (JSON.parse(messageRaw) as UIMessage[]) : [];
      try {
        await createSession({
          id: item.id,
          visibility: "personal",
          title: item.title || "新任务",
          messages: Array.isArray(messages) ? messages : [],
        });
      } catch {
        // already on server or no longer valid
      }
    }
  } finally {
    localStorage.setItem(MIGRATED_KEY, "1");
  }
}

export function parseSessionRef(raw: string) {
  const text = raw.trim();
  if (!text) return "";

  const takeId = (value: string) => {
    const parts = value.split("/").filter(Boolean);
    const index = parts.lastIndexOf("s");
    const id = index >= 0 ? parts[index + 1] : parts[parts.length - 1];
    return (id || "").split(/[?#]/)[0].trim();
  };

  try {
    if (/^https?:\/\//i.test(text)) {
      return takeId(new URL(text).pathname);
    }
  } catch {
    return "";
  }

  if (text.includes("/s/") || text.startsWith("s/") || text.startsWith("/")) {
    return takeId(text);
  }

  return text.split(/[/?#\s]/)[0].trim();
}
