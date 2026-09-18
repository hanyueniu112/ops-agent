import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { userFromRequest } from "@/lib/auth";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { createAgentTools } from "@/lib/tools";
import { streamCursorAgent } from "@/lib/cursor-runtime";
import { canAccessSession, canWriteSession, getStoredSession, updateStoredSession } from "@/lib/session-store";
import { beginSessionTurn } from "@/lib/chat-turns";
import { lastUserPrompt, titleFromText } from "@/lib/public-messages";
import { ensureDreamScheduler } from "@/lib/dream";
import { memoryPromptSnippet } from "@/lib/memory";
import { ensureWorkspace } from "@/lib/workspace";

export const maxDuration = 300;
export const runtime = "nodejs";

type ChatRequest = {
  messages: UIMessage[];
  apiKey?: string;
  baseURL?: string;
  model?: string;
  preset?: string;
  sessionId?: string;
};

export async function POST(req: Request) {
  const user = userFromRequest(req);
  if (!user) return new Response("未登录", { status: 401 });
  ensureDreamScheduler();

  const body = (await req.json()) as ChatRequest;
  let abortSignal: AbortSignal | undefined;
  if (body.sessionId) {
    const session = getStoredSession(body.sessionId);
    if (!session) return new Response("会话不存在", { status: 404 });
    if (!canAccessSession(session, user.id)) return new Response("无权访问该会话", { status: 403 });
    if (!canWriteSession(session, user.id)) return new Response("无权在这个会话里发消息", { status: 403 });
    abortSignal = beginSessionTurn(body.sessionId).signal;
    const title = session.messages.length === 0 ? titleFromText(lastUserPrompt(body.messages || [])) : undefined;
    updateStoredSession(body.sessionId, {
      messages: body.messages || [],
      title,
    });
  }

  const preset = body.preset?.trim() || "cursor";
  const useCursor = preset === "cursor" || (!body.apiKey?.trim() && Boolean(process.env.CURSOR_API_KEY));

  if (useCursor) {
    return streamCursorAgent({
      messages: body.messages,
      sessionId: body.sessionId,
      model: body.model,
      abortSignal,
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
  const memory = await memoryPromptSnippet();
  const system = memory
    ? `${SYSTEM_PROMPT}\n\n## 长期记忆（Dream 深睡沉淀）\n${memory}`
    : SYSTEM_PROMPT;

  const openai = createOpenAI({
    apiKey,
    baseURL,
    name: "openai-compatible",
  });

  const result = streamText({
    model: openai(model),
    system,
    messages: await convertToModelMessages(body.messages),
    tools: createAgentTools(),
    stopWhen: stepCountIs(8),
    abortSignal,
  });

  return result.toUIMessageStreamResponse();
}
