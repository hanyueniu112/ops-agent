import { convertToModelMessages, generateText, stepCountIs, type UIMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { isCursorConfigured, runCursorAgent } from "@/lib/cursor-runtime";
import { memoryPromptSnippet } from "@/lib/memory";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { createAgentTools } from "@/lib/tools";
import { ensureWorkspace } from "@/lib/workspace";
import type { PublicToolCall } from "@/lib/public-messages";

export type AgentTurnResult = {
  text: string;
  thinking: string;
  tools: PublicToolCall[];
  error?: string;
  provider: "cursor" | "openai-compatible";
};

async function runOpenAITurn(messages: UIMessage[], model?: string, abortSignal?: AbortSignal): Promise<AgentTurnResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const baseURL = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const modelId = model?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  if (!apiKey) {
    throw new Error("还没有配置模型。请设置 CURSOR_API_KEY 或 OPENAI_API_KEY。");
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
  const result = await generateText({
    model: openai(modelId),
    system,
    messages: await convertToModelMessages(messages),
    tools: createAgentTools(),
    stopWhen: stepCountIs(8),
    abortSignal,
  });
  const tools: PublicToolCall[] = [];
  for (const call of result.toolCalls || []) {
    const match = (result.toolResults || []).find((item) => "toolCallId" in item && item.toolCallId === call.toolCallId);
    tools.push({
      id: call.toolCallId,
      name: call.toolName,
      input: "input" in call ? call.input : undefined,
      output: match && "output" in match ? match.output : undefined,
    });
  }
  return {
    text: result.text.trim(),
    thinking: (result.reasoningText || "").trim(),
    tools,
    provider: "openai-compatible",
  };
}

export async function runAgentTurn(options: {
  messages: UIMessage[];
  sessionId?: string;
  model?: string;
  abortSignal?: AbortSignal;
}): Promise<AgentTurnResult> {
  if (isCursorConfigured()) {
    const result = await runCursorAgent({
      messages: options.messages,
      sessionId: options.sessionId,
      model: options.model,
      abortSignal: options.abortSignal,
    });
    return {
      text: result.text,
      thinking: result.thinking,
      tools: result.tools,
      error: result.error,
      provider: "cursor",
    };
  }
  return runOpenAITurn(options.messages, options.model, options.abortSignal);
}
