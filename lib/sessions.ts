import type { UIMessage } from "ai";

export type AgentSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: UIMessage[];
};

export const SESSIONS_KEY = "weave-agent-sessions";
export const ACTIVE_KEY = "weave-agent-active";

function messagesKey(id: string) {
  return `weave-agent-messages:${id}`;
}

export function createSessionId() {
  return crypto.randomUUID();
}

export function sessionPath(id: string) {
  return `/s/${id}`;
}

function readList(): AgentSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AgentSession[];
  } catch {
    return [];
  }
}

export function loadSessionMessages(id: string): UIMessage[] {
  if (!id) return [];
  try {
    const raw = localStorage.getItem(messagesKey(id));
    if (raw) {
      const parsed = JSON.parse(raw) as UIMessage[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fall through to list storage
  }
  const fromList = readList().find((session) => session.id === id);
  return fromList?.messages?.length ? fromList.messages : [];
}

export function saveSessionMessages(id: string, messages: UIMessage[]) {
  if (!id || messages.length === 0) return;
  localStorage.setItem(messagesKey(id), JSON.stringify(messages));
}

export function deleteSessionMessages(id: string) {
  localStorage.removeItem(messagesKey(id));
}

export function loadSessions(): AgentSession[] {
  return readList().map((session) => {
    const stored = loadSessionMessages(session.id);
    const messages = stored.length > 0 ? stored : session.messages || [];
    if (messages.length > 0) saveSessionMessages(session.id, messages);
    return { ...session, messages };
  });
}

export function saveSessions(sessions: AgentSession[], activeId?: string) {
  if (sessions.length === 0) return;
  const previous = new Map(readList().map((session) => [session.id, session]));
  const merged = sessions.map((session) => {
    const fromKey = loadSessionMessages(session.id);
    const fromList = previous.get(session.id)?.messages || [];
    const kept =
      session.messages.length > 0
        ? session.messages
        : fromKey.length > 0
          ? fromKey
          : fromList;
    if (kept.length > 0) saveSessionMessages(session.id, kept);
    const title =
      session.title === "新任务" && kept.length > 0 && previous.get(session.id)?.title
        ? previous.get(session.id)!.title
        : session.title;
    return { ...session, title, messages: kept };
  });
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(merged));
  if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
}

export function lastActiveId() {
  return localStorage.getItem(ACTIVE_KEY) || "";
}

export function newSession(id = createSessionId()): AgentSession {
  return {
    id,
    title: "新任务",
    updatedAt: Date.now(),
    messages: [],
  };
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
