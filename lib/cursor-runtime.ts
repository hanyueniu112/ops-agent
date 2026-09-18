import { Agent, Cursor, CursorAgentError, type SettingSource } from "@cursor/sdk";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureWorkspace, workspaceRoot } from "@/lib/workspace";
import { ensureSkillsDirs, personalSkillsRoot } from "@/lib/skills";
import { skillCustomTools } from "@/lib/skill-tools";
import { dreamCustomTools } from "@/lib/dream-tools";
import { readMemoryMarkdown } from "@/lib/memory";
import { ensureDreamScheduler } from "@/lib/dream";

const STORE = path.join(process.cwd(), ".weave-agents.json");

type AgentStore = Record<string, string>;

async function loadStore(): Promise<AgentStore> {
  try {
    return JSON.parse(await readFile(STORE, "utf8")) as AgentStore;
  } catch {
    return {};
  }
}

async function saveAgentId(sessionId: string, agentId: string) {
  const store = await loadStore();
  store[sessionId] = agentId;
  await writeFile(STORE, JSON.stringify(store, null, 2), "utf8");
}

export function lastUserText(messages: UIMessage[]) {
  const user = [...messages].reverse().find((message) => message.role === "user");
  if (!user) return "";
  return user.parts
    .filter((part) => part.type === "text")
    .map((part) => ("text" in part ? part.text : ""))
    .join("\n")
    .trim();
}

function modelSelection(modelId?: string) {
  return {
    id: modelId?.trim() || process.env.CURSOR_MODEL?.trim() || "grok-4.6",
    params: [
      { id: "effort", value: process.env.CURSOR_MODEL_EFFORT?.trim() || "high" },
      { id: "fast", value: process.env.CURSOR_MODEL_FAST?.trim() || "true" },
    ],
  };
}

export function isCursorConfigured() {
  return Boolean(process.env.CURSOR_API_KEY?.trim());
}

export function cursorStatus() {
  return {
    provider: "cursor" as const,
    model: modelSelection().id,
    configured: isCursorConfigured(),
  };
}

export async function runCursorAgent(options: {
  messages: UIMessage[];
  sessionId?: string;
  model?: string;
  abortSignal?: AbortSignal;
}): Promise<{
  text: string;
  thinking: string;
  tools: Array<{ id: string; name: string; input?: unknown; output?: unknown; error?: string }>;
  error?: string;
}> {
  const collected = {
    text: "",
    thinking: "",
    tools: [] as Array<{ id: string; name: string; input?: unknown; output?: unknown; error?: string }>,
    error: "",
  };

  const response = await streamCursorAgent(options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Cursor Agent 运行失败");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Cursor Agent 没有返回内容");
  const decoder = new TextDecoder();
  let buffer = "";
  const toolMap = new Map<string, (typeof collected.tools)[number]>();

  const consume = (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        continue;
      }
      const type = String(event.type || "");
      if (type === "text-delta" && typeof event.delta === "string") collected.text += event.delta;
      if (type === "reasoning-delta" && typeof event.delta === "string") collected.thinking += event.delta;
      if (type === "tool-input-available") {
        const id = String(event.toolCallId || "");
        const item = {
          id,
          name: String(event.toolName || "tool"),
          input: event.input,
        };
        toolMap.set(id, item);
      }
      if (type === "tool-output-available") {
        const id = String(event.toolCallId || "");
        const current = toolMap.get(id) || { id, name: "tool" };
        current.output = event.output;
        toolMap.set(id, current);
      }
      if (type === "tool-output-error") {
        const id = String(event.toolCallId || "");
        const current = toolMap.get(id) || { id, name: "tool" };
        current.error = String(event.errorText || "工具调用失败");
        toolMap.set(id, current);
      }
      if (type === "error") collected.error = String(event.errorText || "这次任务没有完成。");
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    consume(decoder.decode(value, { stream: true }));
  }
  consume(decoder.decode());
  collected.tools = [...toolMap.values()];
  return {
    text: collected.text.trim(),
    thinking: collected.thinking.trim(),
    tools: collected.tools,
    error: collected.error || undefined,
  };
}

export async function streamCursorAgent(options: {
  messages: UIMessage[];
  sessionId?: string;
  model?: string;
  abortSignal?: AbortSignal;
}) {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    return new Response("还没有配置 Cursor API Key。", { status: 400 });
  }

  const prompt = lastUserText(options.messages);
  if (!prompt) {
    return new Response("没有收到用户消息。", { status: 400 });
  }

  await ensureWorkspace();
  await ensureSkillsDirs();
  ensureDreamScheduler();
  Cursor.configure({ local: { useHttp1ForAgent: true } });

  const sessionId = options.sessionId?.trim() || "default";
  const store = await loadStore();
  const previousId = store[sessionId];
  const settingSources: SettingSource[] = ["project", "user"];
  const agentOptions = {
    apiKey,
    model: modelSelection(options.model),
    local: {
      cwd: workspaceRoot(),
      dirs: [personalSkillsRoot()],
      settingSources,
      customTools: { ...skillCustomTools(), ...dreamCustomTools() },
    },
  };

  let agent;
  try {
    agent = previousId
      ? await Agent.resume(previousId, agentOptions)
      : await Agent.create(agentOptions);
  } catch {
    agent = await Agent.create(agentOptions);
  }

  await saveAgentId(sessionId, agent.agentId);

  const stream = createUIMessageStream({
    originalMessages: options.messages,
    onError: (error) =>
      error instanceof CursorAgentError ? error.message : "Cursor Agent 运行失败",
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "start-step" });

      const textId = "cursor-text";
      let textOpen = false;
      const reasoningId = "cursor-reasoning";
      let reasoningOpen = false;
      const tools = new Set<string>();

      const openText = () => {
        if (textOpen) return;
        writer.write({ type: "text-start", id: textId });
        textOpen = true;
      };
      const openReasoning = () => {
        if (reasoningOpen) return;
        writer.write({ type: "reasoning-start", id: reasoningId });
        reasoningOpen = true;
      };

      try {
        const memory = (await readMemoryMarkdown()).trim();
        const prefixed = memory
          ? `长期记忆（Dream 深睡，仅公共会话沉淀）如下。相关时先对照记忆再动手。完整文件在 workspace/.ops/MEMORY.md，日记在 .ops/DREAMS.md。\n\n${memory.slice(0, 3000)}\n\n用户任务：\n${prompt}`
          : prompt;
        const run = await agent.send(prefixed);
        for await (const event of run.stream()) {
          if (options.abortSignal?.aborted) break;
          if (event.type === "assistant") {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text) {
                openText();
                writer.write({ type: "text-delta", id: textId, delta: block.text });
              }
            }
          }
          if (event.type === "thinking" && event.text) {
            openReasoning();
            writer.write({
              type: "reasoning-delta",
              id: reasoningId,
              delta: event.text,
            });
          }
          if (event.type === "tool_call") {
            if (!tools.has(event.call_id) && event.status === "running") {
              tools.add(event.call_id);
              writer.write({
                type: "tool-input-available",
                toolCallId: event.call_id,
                toolName: event.name,
                input: event.args ?? {},
              });
            }
            if (event.status === "completed") {
              if (!tools.has(event.call_id)) {
                tools.add(event.call_id);
                writer.write({
                  type: "tool-input-available",
                  toolCallId: event.call_id,
                  toolName: event.name,
                  input: event.args ?? {},
                });
              }
              writer.write({
                type: "tool-output-available",
                toolCallId: event.call_id,
                output: event.result ?? { ok: true },
              });
            }
            if (event.status === "error") {
              writer.write({
                type: "tool-output-error",
                toolCallId: event.call_id,
                errorText: String(event.result ?? "工具调用失败"),
              });
            }
          }
        }
        if (options.abortSignal?.aborted) {
          writer.write({ type: "error", errorText: "已被后一条提问覆盖" });
        } else {
          const result = await run.wait();
          if (result.status === "error") {
            writer.write({ type: "error", errorText: "这次任务没有完成。" });
          }
        }
      } finally {
        if (reasoningOpen) writer.write({ type: "reasoning-end", id: reasoningId });
        if (textOpen) writer.write({ type: "text-end", id: textId });
        writer.write({ type: "finish-step" });
        writer.write({ type: "finish" });
        await agent[Symbol.asyncDispose]();
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
