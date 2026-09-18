import { userFromRequest } from "@/lib/auth";
import { ensureDreamScheduler } from "@/lib/dream";
import { createStoredSession, listVisibleSessions } from "@/lib/session-store";
import type { SessionVisibility } from "@/lib/session-store";
import type { UIMessage } from "ai";

export const runtime = "nodejs";

function errorJson(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET(req: Request) {
  const user = userFromRequest(req);
  if (!user) return errorJson("未登录", 401);
  ensureDreamScheduler();
  return Response.json({ sessions: listVisibleSessions(user.id) });
}

export async function POST(req: Request) {
  const user = userFromRequest(req);
  if (!user) return errorJson("未登录", 401);
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    visibility?: SessionVisibility;
    title?: string;
    messages?: UIMessage[];
  };
  const visibility = body.visibility === "public" ? "public" : "personal";
  try {
    const session = createStoredSession({
      id: body.id,
      userId: user.id,
      username: user.username,
      visibility,
      title: body.title,
      messages: body.messages,
    });
    return Response.json({ session }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建失败";
    if (message.includes("UNIQUE")) return errorJson("会话已存在", 409);
    return errorJson(message, 500);
  }
}
