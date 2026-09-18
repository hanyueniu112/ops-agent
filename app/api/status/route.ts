import { userFromRequest } from "@/lib/auth";
import { cursorStatus } from "@/lib/cursor-runtime";
import { ensureDreamScheduler } from "@/lib/dream";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!userFromRequest(req)) return Response.json({ error: "未登录" }, { status: 401 });
  ensureDreamScheduler();
  return Response.json(cursorStatus());
}
