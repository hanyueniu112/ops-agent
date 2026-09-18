import { northboundActor } from "@/lib/api-auth";
import { errorApi, jsonApi, optionsApi } from "@/lib/api-http";
import { getChatJob } from "@/lib/chat-jobs";
import { canAccessSession, getStoredSession } from "@/lib/session-store";
import { publicJob, publicSession } from "@/lib/v1-present";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export function OPTIONS() {
  return optionsApi();
}

export async function GET(_req: Request, context: RouteContext) {
  const actor = northboundActor();
  const { id } = await context.params;
  const job = getChatJob(id);
  if (!job) return errorApi("任务不存在", 404);
  const session = getStoredSession(job.sessionId);
  if (!session) return errorApi("会话不存在", 404);
  if (!canAccessSession(session, actor.id) && job.userId !== actor.id) {
    return errorApi("无权查看该任务", 403);
  }
  return jsonApi({
    job: publicJob(job),
    chat: publicSession(session, job, true),
    result: job.result,
  });
}
