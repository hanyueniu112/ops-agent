import { northboundActor } from "@/lib/api-auth";
import { jsonApi, optionsApi } from "@/lib/api-http";

export const runtime = "nodejs";

export function OPTIONS() {
  return optionsApi();
}

export async function GET() {
  const actor = northboundActor();
  return jsonApi({
    user: {
      id: actor.id,
      username: actor.username,
      kind: actor.kind,
    },
  });
}
