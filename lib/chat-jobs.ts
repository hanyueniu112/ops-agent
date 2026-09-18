import { getDb } from "@/lib/db";
import { runAgentTurn } from "@/lib/agent-turn";
import {
  makeAssistantMessage,
  makeUserMessage,
  titleFromText,
  toPublicMessage,
  type PublicMessage,
} from "@/lib/public-messages";
import {
  appendStoredMessages,
  canWriteSession,
  createStoredSession,
  getStoredSession,
  updateStoredSession,
  type SessionVisibility,
  type StoredSession,
} from "@/lib/session-store";
import { beginSessionTurn, isCurrentTurn } from "@/lib/chat-turns";
import { isAiopsUser } from "@/lib/aiops-account";
import type { AuthUser } from "@/lib/auth";

export type ChatJobStatus = "running" | "done" | "error" | "superseded";

export type ChatJob = {
  id: string;
  sessionId: string;
  userId: string;
  status: ChatJobStatus;
  prompt: string;
  reply: string;
  error: string;
  result: PublicMessage | null;
  startedAt: number;
  finishedAt: number | null;
};

type JobRow = {
  id: string;
  session_id: string;
  user_id: string;
  status: string;
  prompt: string;
  reply: string;
  error: string;
  result_json: string;
  started_at: number;
  finished_at: number | null;
};

function parseResult(raw: string): PublicMessage | null {
  try {
    const parsed = JSON.parse(raw) as PublicMessage;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function mapJob(row: JobRow): ChatJob {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    status: row.status as ChatJobStatus,
    prompt: row.prompt,
    reply: row.reply,
    error: row.error,
    result: parseResult(row.result_json),
    startedAt: Number(row.started_at),
    finishedAt: row.finished_at == null ? null : Number(row.finished_at),
  };
}

export function getChatJob(id: string) {
  const row = getDb().prepare("SELECT * FROM chat_jobs WHERE id = ?").get(id) as JobRow | undefined;
  return row ? mapJob(row) : null;
}

export function latestJobForSession(sessionId: string) {
  const row = getDb()
    .prepare("SELECT * FROM chat_jobs WHERE session_id = ? ORDER BY started_at DESC LIMIT 1")
    .get(sessionId) as JobRow | undefined;
  return row ? mapJob(row) : null;
}

function supersedeRunningJobs(sessionId: string) {
  const running = getDb()
    .prepare("SELECT id, base_messages_json FROM chat_jobs WHERE session_id = ? AND status = 'running'")
    .all(sessionId) as Array<{ id: string; base_messages_json: string }>;
  if (running.length === 0) return;
  const now = Date.now();
  for (const job of running) {
    getDb()
      .prepare(
        `UPDATE chat_jobs
         SET status = 'superseded', error = '已被后一条提问覆盖', finished_at = ?
         WHERE id = ?`,
      )
      .run(now, job.id);
  }
  try {
    const base = JSON.parse(running[running.length - 1].base_messages_json) as StoredSession["messages"];
    if (Array.isArray(base)) updateStoredSession(sessionId, { messages: base });
  } catch {
    // keep current messages if snapshot is unusable
  }
}

export async function startChatJob(input: {
  user: AuthUser;
  message: string;
  sessionId?: string;
  visibility?: SessionVisibility;
  title?: string;
  model?: string;
}): Promise<{ job: ChatJob; session: StoredSession; run: () => Promise<void> }> {
  const text = input.message.trim();
  if (!text) throw new Error("message 不能为空");

  let session = input.sessionId ? getStoredSession(input.sessionId) : null;
  if (input.sessionId && !session) throw new Error("会话不存在");
  if (session && !canWriteSession(session, input.user.id)) {
    throw new Error("无权在这个会话里发消息");
  }

  if (!session) {
    session = createStoredSession({
      userId: input.user.id,
      username: input.user.username,
      visibility: input.visibility
        ? input.visibility
        : isAiopsUser(input.user)
          ? "public"
          : "personal",
      title: input.title?.trim() || titleFromText(text),
    });
  }

  supersedeRunningJobs(session.id);
  session = getStoredSession(session.id)!;
  const baseMessages = session.messages;
  const turn = beginSessionTurn(session.id);

  const id = crypto.randomUUID();
  const started = Date.now();
  getDb()
    .prepare(
      `INSERT INTO chat_jobs (id, session_id, user_id, status, prompt, reply, error, result_json, base_messages_json, started_at, finished_at)
       VALUES (?, ?, ?, 'running', ?, '', '', '{}', ?, ?, NULL)`,
    )
    .run(id, session.id, input.user.id, text, JSON.stringify(baseMessages), started);

  const userMessage = makeUserMessage(text);
  const titled = session.messages.length === 0 ? titleFromText(text) : undefined;
  appendStoredMessages(session.id, [userMessage], titled);
  session = getStoredSession(session.id)!;

  const run = () =>
    (async () => {
      const stillCurrent = () => isCurrentTurn(session!.id, turn.seq) && getChatJob(id)?.status === "running";
      try {
        const current = getStoredSession(session!.id);
        if (!current) throw new Error("会话不存在");
        if (!stillCurrent()) return;
        const result = await runAgentTurn({
          messages: current.messages,
          sessionId: current.id,
          model: input.model,
          abortSignal: turn.signal,
        });
        if (!stillCurrent()) return;
        const assistant = makeAssistantMessage(result);
        appendStoredMessages(current.id, [assistant]);
        const publicResult = toPublicMessage(assistant);
        getDb()
          .prepare(
            `UPDATE chat_jobs
             SET status = ?, reply = ?, error = ?, result_json = ?, finished_at = ?
             WHERE id = ? AND status = 'running'`,
          )
          .run(
            result.error ? "error" : "done",
            publicResult.text,
            result.error || "",
            JSON.stringify(publicResult),
            Date.now(),
            id,
          );
      } catch (error) {
        if (!stillCurrent()) return;
        if (turn.signal.aborted) {
          getDb()
            .prepare(
              `UPDATE chat_jobs
               SET status = 'superseded', error = '已被后一条提问覆盖', finished_at = ?
               WHERE id = ? AND status = 'running'`,
            )
            .run(Date.now(), id);
          return;
        }
        const message = error instanceof Error ? error.message : "对话失败";
        const assistant = makeAssistantMessage({ text: "", error: message });
        appendStoredMessages(session!.id, [assistant]);
        getDb()
          .prepare(
            `UPDATE chat_jobs
             SET status = 'error', error = ?, result_json = ?, finished_at = ?
             WHERE id = ? AND status = 'running'`,
          )
          .run(message, JSON.stringify(toPublicMessage(assistant)), Date.now(), id);
      }
    })();

  return { job: getChatJob(id)!, session, run };
}

export type StartedChat = Awaited<ReturnType<typeof startChatJob>>;
