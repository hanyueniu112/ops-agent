import { issueApiKey, listApiKeys, requireActor } from "@/lib/api-auth";
import { errorApi, jsonApi, optionsApi } from "@/lib/api-http";

export const runtime = "nodejs";

export function OPTIONS() {
  return optionsApi();
}

export async function GET(req: Request) {
  const actor = requireActor(req);
  if (!actor) return errorApi("未授权", 401);
  return jsonApi({
    keys: listApiKeys().map((item) => ({
      id: item.id,
      name: item.name,
      prefix: item.prefix,
      createdAt: item.created_at,
      lastUsedAt: item.last_used_at,
    })),
  });
}

export async function POST(req: Request) {
  const actor = requireActor(req);
  if (!actor) return errorApi("未授权", 401);
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  try {
    const issued = issueApiKey(body.name || "", actor.id);
    return jsonApi(
      {
        key: issued.key,
        id: issued.id,
        name: issued.name,
        prefix: issued.prefix,
        note: "明文只返回这一次，请立刻保存。",
      },
      201,
    );
  } catch (error) {
    return errorApi(error instanceof Error ? error.message : "签发失败", 400);
  }
}
