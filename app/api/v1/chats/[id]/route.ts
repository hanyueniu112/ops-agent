import { northboundActor } from "@/lib/api-auth";
import { errorApi, jsonApi, optionsApi } from "@/lib/api-http";
import { latestJobForSession } from "@/lib/chat-jobs";
import { canAccessSession, getStoredSession } from "@/lib/session-store";
import { publicSession } from "@/lib/v1-present";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export function OPTIONS() {
  return optionsApi();
}

export async function GET(_req: Request, context: RouteContext) {
  const actor = northboundActor();
  const { id } = await context.params;
  const session = getStoredSession(id);
  if (!session) return errorApi("会话不存在", 404);
  if (!canAccessSession(session, actor.id)) return errorApi("无权查看该会话", 403);
  const job = latestJobForSession(session.id);
  return jsonApi({ chat: publicSession(session, job, true), job: job || null });
}
