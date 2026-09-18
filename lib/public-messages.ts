import type { UIMessage } from "ai";

export type PublicToolCall = {
  id: string;
  name: string;
  input?: unknown;
  output?: unknown;
  error?: string;
};

export type PublicMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  thinking?: string;
  tools: PublicToolCall[];
};

export function lastUserPrompt(messages: UIMessage[]) {
  const user = [...messages].reverse().find((item) => item.role === "user");
  return user ? messageText(user) : "";
}

export function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text" && "text" in part)
    .map((part) => ("text" in part ? part.text : ""))
    .join("\n")
    .trim();
}

export function messageThinking(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "reasoning" && "text" in part)
    .map((part) => ("text" in part ? part.text : ""))
    .join("\n")
    .trim();
}

export function messageTools(message: UIMessage): PublicToolCall[] {
  const tools: PublicToolCall[] = [];
  for (const part of message.parts) {
    if (!("toolCallId" in part) || typeof part.toolCallId !== "string") continue;
    const name =
      part.type === "dynamic-tool" && "toolName" in part
        ? String(part.toolName)
        : part.type.startsWith("tool-")
          ? part.type.slice(5)
          : part.type;
    const input = "input" in part ? part.input : undefined;
    const output = "output" in part ? part.output : undefined;
    const error = "errorText" in part && typeof part.errorText === "string" ? part.errorText : undefined;
    tools.push({ id: part.toolCallId, name, input, output, error });
  }
  return tools;
}

export function toPublicMessage(message: UIMessage): PublicMessage {
  return {
    id: message.id,
    role: message.role,
    text: messageText(message),
    thinking: messageThinking(message) || undefined,
    tools: messageTools(message),
  };
}

export function lastAssistant(messages: UIMessage[]) {
  const found = [...messages].reverse().find((item) => item.role === "assistant");
  return found ? toPublicMessage(found) : null;
}

export function makeUserMessage(text: string): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text }],
  };
}

export function makeAssistantMessage(input: {
  text: string;
  thinking?: string;
  tools?: PublicToolCall[];
  error?: string;
}): UIMessage {
  const parts: UIMessage["parts"] = [];
  if (input.thinking?.trim()) {
    parts.push({ type: "reasoning", text: input.thinking, state: "done" });
  }
  for (const tool of input.tools || []) {
    if (tool.error) {
      parts.push({
        type: "dynamic-tool",
        toolName: tool.name,
        toolCallId: tool.id,
        state: "output-error",
        input: tool.input,
        errorText: tool.error,
      });
    } else {
      parts.push({
        type: "dynamic-tool",
        toolName: tool.name,
        toolCallId: tool.id,
        state: "output-available",
        input: tool.input,
        output: tool.output ?? { ok: true },
      });
    }
  }
  const text = input.error && !input.text.trim() ? input.error : input.text;
  if (text.trim()) parts.push({ type: "text", text, state: "done" });
  if (parts.length === 0) parts.push({ type: "text", text: "", state: "done" });
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    parts,
  };
}

export function titleFromText(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 22) || "新任务";
}
