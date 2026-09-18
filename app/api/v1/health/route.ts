import { cursorStatus } from "@/lib/cursor-runtime";
import { jsonApi, optionsApi } from "@/lib/api-http";
import { ensureAiopsUser } from "@/lib/aiops-account";

export const runtime = "nodejs";

export async function GET() {
  const cursor = cursorStatus();
  const aiops = ensureAiopsUser();
  return jsonApi({
    ok: true,
    name: "OPS大脑",
    version: "v1",
    time: new Date().toISOString(),
    aiops: { username: aiops.username, id: aiops.id },
    model: {
      provider: cursor.configured ? "cursor" : process.env.OPENAI_API_KEY ? "openai-compatible" : "none",
      model: cursor.model,
    },
  });
}

export function OPTIONS() {
  return optionsApi();
}
