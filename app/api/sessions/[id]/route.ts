import { userFromRequest } from "@/lib/auth";
import {
  canAccessSession,
  canWriteSession,
  deleteStoredSession,
  getStoredSession,
  updateStoredSession,
  type SessionVisibility,
} from "@/lib/session-store";
import { lastUserPrompt } from "@/lib/public-messages";
import type { UIMessage } from "ai";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function errorJson(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET(req: Request, context: RouteContext) {
  const user = userFromRequest(req);
  if (!user) return errorJson("未登录", 401);
  const { id } = await context.params;
  const session = getStoredSession(id);
  if (!session) return errorJson("会话不存在", 404);
  if (!canAccessSession(session, user.id)) return errorJson("这是别人的个人会话", 403);
  return Response.json({ session });
}

export async function PATCH(req: Request, context: RouteContext) {
  const user = userFromRequest(req);
  if (!user) return errorJson("未登录", 401);
  const { id } = await context.params;
  const session = getStoredSession(id);
  if (!session) return errorJson("会话不存在", 404);
  if (session.ownerId !== user.id && session.visibility !== "public") {
    return errorJson("这是别人的个人会话", 403);
  }
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    messages?: UIMessage[];
    visibility?: SessionVisibility;
  };
  const visibility =
    body.visibility === "public" || body.visibility === "personal" ? body.visibility : undefined;
  if (visibility && session.ownerId !== user.id) {
    return errorJson("只有创建者能改会话类型", 403);
  }
  if (body.messages && !canWriteSession(session, user.id)) {
    return errorJson("无权改这个会话", 403);
  }
  if (
    body.messages &&
    session.visibility === "public" &&
    lastUserPrompt(session.messages) &&
    lastUserPrompt(body.messages) !== lastUserPrompt(session.messages)
  ) {
    return Response.json({ session, ignored: true });
  }
  const updated = updateStoredSession(id, {
    title: body.title,
    messages: body.messages,
    visibility,
  });
  return Response.json({ session: updated });
}

export async function DELETE(req: Request, context: RouteContext) {
  const user = userFromRequest(req);
  if (!user) return errorJson("未登录", 401);
  const { id } = await context.params;
  const session = getStoredSession(id);
  if (!session) return errorJson("会话不存在", 404);
  if (session.ownerId !== user.id) return errorJson("只有创建者能删除", 403);
  deleteStoredSession(id);
  return Response.json({ ok: true });
}
