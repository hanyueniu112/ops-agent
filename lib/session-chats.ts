import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { AgentSettings } from "@/lib/settings";
import { saveSessionMessages } from "@/lib/sessions";

const chats = new Map<string, Chat<UIMessage>>();
const listeners = new Set<(sessionId: string) => void>();

function notify(sessionId: string) {
  listeners.forEach((listener) => listener(sessionId));
}

export function subscribeSessionChats(listener: (sessionId: string) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function peekSessionChat(sessionId: string) {
  return chats.get(sessionId);
}

export function getSessionChat(
  sessionId: string,
  initialMessages: UIMessage[],
  getSettings: () => AgentSettings,
) {
  const existing = chats.get(sessionId);
  if (existing) return existing;

  const chat = new Chat<UIMessage>({
    id: sessionId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => {
        const settings = getSettings();
        return {
          apiKey: settings.apiKey,
          baseURL: settings.baseURL,
          model: settings.model,
          preset: settings.preset,
          sessionId,
        };
      },
    }),
  });

  chat["~registerMessagesCallback"](() => {
    if (chat.messages.length > 0) saveSessionMessages(sessionId, chat.messages);
  });
  chat["~registerStatusCallback"](() => {
    if (chat.messages.length > 0) saveSessionMessages(sessionId, chat.messages);
    notify(sessionId);
  });

  chats.set(sessionId, chat);
  return chat;
}

export function isSessionChatBusy(sessionId: string) {
  const status = chats.get(sessionId)?.status ?? "ready";
  return status === "submitted" || status === "streaming";
}

export function disposeSessionChat(sessionId: string) {
  const chat = chats.get(sessionId);
  if (!chat) return;
  void chat.stop();
  chats.delete(sessionId);
}
