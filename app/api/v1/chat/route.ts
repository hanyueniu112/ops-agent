import { after } from "next/server";
import { northboundActor } from "@/lib/api-auth";
import { errorApi, jsonApi, optionsApi } from "@/lib/api-http";
import { getChatJob, startChatJob } from "@/lib/chat-jobs";
import { getStoredSession } from "@/lib/session-store";
import { publicJob, publicSession } from "@/lib/v1-present";

export const runtime = "nodejs";
export const maxDuration = 300;

export function OPTIONS() {
  return optionsApi();
}

export async function POST(req: Request) {
  const actor = northboundActor();

  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    sessionId?: string;
    visibility?: "public" | "personal";
    title?: string;
    model?: string;
    wait?: boolean;
  };
  const wait = body.wait !== false;
  try {
    const started = await startChatJob({
      user: actor,
      message: body.message || "",
      sessionId: body.sessionId,
      visibility: body.visibility,
      title: body.title,
      model: body.model,
    });
    if (wait) {
      await started.run();
    } else {
      after(() => started.run());
    }
    const job = getChatJob(started.job.id)!;
    const session = getStoredSession(job.sessionId)!;
    return jsonApi(
      {
        job: publicJob(job),
        chat: publicSession(session, job, wait),
        result: job.result,
      },
      wait ? 200 : 202,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "对话失败";
    const status = message.includes("不存在")
      ? 404
      : message.includes("无权")
        ? 403
        : 400;
    return errorApi(message, status);
  }
}
