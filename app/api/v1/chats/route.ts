import { northboundActor } from "@/lib/api-auth";
import { errorApi, jsonApi, optionsApi } from "@/lib/api-http";
import { latestJobForSession } from "@/lib/chat-jobs";
import { createStoredSession, listVisibleSessions } from "@/lib/session-store";
import { publicSession } from "@/lib/v1-present";

export const runtime = "nodejs";

export function OPTIONS() {
  return optionsApi();
}

export async function GET() {
  const actor = northboundActor();
  const sessions = listVisibleSessions(actor.id).map((session) =>
    publicSession(session, latestJobForSession(session.id), false),
  );
  return jsonApi({ chats: sessions });
}

export async function POST(req: Request) {
  const actor = northboundActor();
  const body = (await req.json().catch(() => ({}))) as {
    visibility?: "public" | "personal";
    title?: string;
  };
  const session = createStoredSession({
    userId: actor.id,
    username: actor.username,
    visibility: body.visibility === "personal" ? "personal" : "public",
    title: body.title,
  });
  return jsonApi({ chat: publicSession(session, null, true) }, 201);
}
