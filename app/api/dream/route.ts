import { userFromRequest } from "@/lib/auth";
import { dreamStatus, runDreamCycle } from "@/lib/dream";

export const runtime = "nodejs";
export const maxDuration = 120;

function unauthorized() {
  return Response.json({ error: "未登录" }, { status: 401 });
}

export async function GET(req: Request) {
  if (!userFromRequest(req)) return unauthorized();
  try {
    return Response.json(await dreamStatus());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取失败" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  if (!userFromRequest(req)) return unauthorized();
  try {
    const run = await runDreamCycle("manual");
    return Response.json({ ok: true, run, status: await dreamStatus() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Dream 失败" }, { status: 400 });
  }
}
