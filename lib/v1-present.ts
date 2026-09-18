import { lastAssistant, toPublicMessage } from "@/lib/public-messages";
import type { ChatJob } from "@/lib/chat-jobs";
import type { StoredSession } from "@/lib/session-store";

export function publicSession(session: StoredSession, job?: ChatJob | null, includeMessages = true) {
  const messages = session.messages.map(toPublicMessage);
  return {
    id: session.id,
    title: session.title,
    visibility: session.visibility,
    ownerId: session.ownerId,
    ownerName: session.ownerName,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    status: job?.status || "idle",
    last: lastAssistant(session.messages) || job?.result || null,
    messages: includeMessages ? messages : undefined,
  };
}

export function publicJob(job: ChatJob) {
  return {
    id: job.id,
    sessionId: job.sessionId,
    status: job.status,
    prompt: job.prompt,
    reply: job.reply,
    error: job.error || undefined,
    result: job.result,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}
