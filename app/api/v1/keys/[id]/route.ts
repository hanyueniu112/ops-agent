import { requireActor, revokeApiKey } from "@/lib/api-auth";
import { errorApi, jsonApi, optionsApi } from "@/lib/api-http";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export function OPTIONS() {
  return optionsApi();
}

export async function DELETE(req: Request, context: RouteContext) {
  const actor = requireActor(req);
  if (!actor) return errorApi("未授权", 401);
  const { id } = await context.params;
  if (!revokeApiKey(id)) return errorApi("密钥不存在或已吊销", 404);
  return jsonApi({ ok: true, id });
}
