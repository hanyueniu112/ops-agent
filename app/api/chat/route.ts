import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { createAgentTools } from "@/lib/tools";
import { streamCursorAgent } from "@/lib/cursor-runtime";
import { ensureWorkspace } from "@/lib/workspace";

export const maxDuration = 300;

type ChatRequest = {
  messages: UIMessage[];
  apiKey?: string;
  baseURL?: string;
  model?: string;
  preset?: string;
  sessionId?: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as ChatRequest;
  const preset = body.preset?.trim() || "cursor";
  const useCursor = preset === "cursor" || (!body.apiKey?.trim() && Boolean(process.env.CURSOR_API_KEY));

  if (useCursor) {
    return streamCursorAgent({
      messages: body.messages,
      sessionId: body.sessionId,
      model: body.model,
    });
  }

  const apiKey = body.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
  const baseURL =
    body.baseURL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    "https://api.openai.com/v1";
  const model =
    body.model?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  if (!apiKey) {
    return new Response("还没有配置 API Key。请先在右上角设置里填入密钥。", {
      status: 400,
    });
  }

  await ensureWorkspace();

  const openai = createOpenAI({
    apiKey,
    baseURL,
    name: "openai-compatible",
  });

  const result = streamText({
    model: openai(model),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(body.messages),
    tools: createAgentTools(),
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse();
}
