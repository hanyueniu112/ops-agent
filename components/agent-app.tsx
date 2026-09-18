"use client";

import { useChat } from "@ai-sdk/react";
import { isReasoningUIPart, isToolUIPart, type UIMessage } from "ai";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type MutableRefObject, type ReactNode } from "react";
import { ExportMdButton } from "@/components/export-md-button";
import { MarkdownView } from "@/components/markdown-view";
import { ThinkBlock } from "@/components/think-block";
import { ToolFold } from "@/components/tool-card";
import { SkillsPanel } from "@/components/skills-panel";
import {
  disposeSessionChat,
  getSessionChat,
  isSessionChatBusy,
  peekSessionChat,
  subscribeSessionChats,
} from "@/lib/session-chats";
import {
  deleteSessionMessages,
  loadSessionMessages,
  loadSessions,
  newSession,
  parseSessionRef,
  saveSessionMessages,
  saveSessions,
  sessionPath,
  type AgentSession,
} from "@/lib/sessions";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  PROVIDER_PRESETS,
  saveSettings,
  type AgentSettings,
} from "@/lib/settings";

const SUGGESTIONS = [
  "看看工作区里现在有什么文件",
  "列出当前技能，再写一个项目技能",
  "帮我在工作区写一个 hello.py 并运行它",
];

function bodyMarkdown(parts: UIMessage["parts"]) {
  return parts
    .filter((part) => part.type === "text" && "text" in part && part.text.trim())
    .map((part) => ("text" in part ? part.text : ""))
    .join("\n\n")
    .trim();
}

function renderMessageParts(
  messageId: string,
  parts: UIMessage["parts"],
  live = false,
  exportName = "正文.md",
) {
  const thinkTexts: string[] = [];
  let thinkStreaming = false;
  const toolParts: UIMessage["parts"] = [];
  const nodes: ReactNode[] = [];

  parts.forEach((part, index) => {
    if (isReasoningUIPart(part)) {
      if (part.text) thinkTexts.push(part.text);
      if (part.state === "streaming") thinkStreaming = true;
      return;
    }
    if (isToolUIPart(part)) {
      toolParts.push(part);
      return;
    }
    if (part.type === "text" && part.text.trim()) {
      nodes.push(
        <MarkdownView
          key={`${messageId}-${index}`}
          className="bubble-text"
          text={part.text}
        />,
      );
    }
  });

  const markdown = bodyMarkdown(parts);

  return (
    <>
      <ThinkBlock
        key={`${messageId}-think`}
        text={thinkTexts.join("")}
        streaming={live && thinkStreaming}
      />
      <ToolFold key={`${messageId}-tools`} id={messageId} parts={toolParts} live={live} />
      {nodes.length > 0 ? (
        <div className="body-block">
          <div className="body-toolbar">
            <ExportMdButton markdown={markdown} filename={exportName} />
          </div>
          {nodes}
        </div>
      ) : null}
    </>
  );
}

function titleFromMessages(messages: UIMessage[]) {
  const first = messages.find((message) => message.role === "user");
  if (!first) return "新任务";
  const text = first.parts
    .filter((part) => part.type === "text")
    .map((part) => ("text" in part ? part.text : ""))
    .join("")
    .trim();
  return text.slice(0, 22) || "新任务";
}

export function AgentApp() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [jumpValue, setJumpValue] = useState("");
  const [jumpHint, setJumpHint] = useState("");
  const [copied, setCopied] = useState(false);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const stored = loadSessions();
    setSessions(stored);
    const loaded = loadSettings();
    setSettings(loaded);
    if (loaded.preset !== "cursor" && !loaded.apiKey) setSettingsOpen(true);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !sessionId) return;
    setSessions((current) => {
      if (current.some((session) => session.id === sessionId)) return current;
      const messages = loadSessionMessages(sessionId);
      return [
        {
          ...newSession(sessionId),
          messages,
          title: messages.length > 0 ? titleFromMessages(messages) : "新任务",
        },
        ...current,
      ];
    });
  }, [hydrated, sessionId]);

  useEffect(() => {
    if (!hydrated || !sessionId || sessions.length === 0) return;
    saveSessions(sessions, sessionId);
  }, [sessions, sessionId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    return subscribeSessionChats((id) => {
      const busy = isSessionChatBusy(id);
      setBusyIds((current) => {
        const has = current.includes(id);
        if (busy) return has ? current : [...current, id];
        if (!has) return current;
        return current.filter((item) => item !== id);
      });
      const messages = peekSessionChat(id)?.messages || [];
      if (messages.length === 0) return;
      saveSessionMessages(id, messages);
      const title = titleFromMessages(messages);
      setSessions((current) => {
        const session = current.find((item) => item.id === id);
        if (!session || (session.messages === messages && session.title === title)) return current;
        return current.map((item) =>
          item.id === id ? { ...item, messages, title, updatedAt: Date.now() } : item,
        );
      });
    });
  }, [hydrated]);

  useEffect(() => {
    const active = sessions.find((session) => session.id === sessionId);
    document.title = active ? `${active.title} · OPS大脑` : "OPS大脑";
  }, [sessions, sessionId]);

  const active = sessions.find((session) => session.id === sessionId);

  function updateSettings(next: AgentSettings) {
    setSettings(next);
    saveSettings(next);
  }

  function openSession(id: string) {
    if (!id || id === sessionId) return;
    router.push(sessionPath(id));
  }

  function jumpToSession(event: FormEvent) {
    event.preventDefault();
    const id = parseSessionRef(jumpValue);
    if (!id) {
      setJumpHint("请输入 session id");
      return;
    }
    if (id === sessionId) {
      setJumpHint("已在当前会话");
      return;
    }
    setJumpHint("");
    setJumpValue("");
    openSession(id);
  }

  async function copySessionId() {
    if (!sessionId) return;
    await navigator.clipboard.writeText(sessionId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  if (!hydrated || !sessionId || !active) {
    return <div className="app-shell" />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">脑</span>
          <div>
            <div className="brand-name">OPS大脑</div>
            <div className="brand-sub">本机 Agent</div>
          </div>
        </div>
        <button
          className="new-task"
          onClick={() => {
            const session = newSession();
            const next = [session, ...sessions];
            setSessions(next);
            saveSessions(next, session.id);
            router.push(sessionPath(session.id));
          }}
        >
          新任务
        </button>
        <button className="ghost-btn skills-entry" onClick={() => setSkillsOpen(true)}>
          技能
        </button>
        <form className="session-jump" onSubmit={jumpToSession}>
          <label htmlFor="session-jump-input">跳转会话</label>
          <div className="session-jump-row">
            <input
              id="session-jump-input"
              value={jumpValue}
              placeholder="输入 session id"
              autoComplete="off"
              onChange={(event) => {
                setJumpValue(event.target.value);
                if (jumpHint) setJumpHint("");
              }}
            />
            <button type="submit">跳转</button>
          </div>
          {jumpHint ? <p className="jump-hint">{jumpHint}</p> : null}
        </form>
        <div className="session-list">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={sessionPath(session.id)}
              className={`session-item ${session.id === active.id ? "is-active" : ""}`}
            >
              <span>{session.title}</span>
              {busyIds.includes(session.id) ? <span className="session-busy">处理中</span> : null}
              <button
                type="button"
                className="session-delete"
                aria-label="删除会话"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const next = sessions.filter((item) => item.id !== session.id);
                  deleteSessionMessages(session.id);
                  disposeSessionChat(session.id);
                  setBusyIds((current) => current.filter((id) => id !== session.id));
                  if (next.length === 0) {
                    const fresh = newSession();
                    setSessions([fresh]);
                    saveSessions([fresh], fresh.id);
                    router.push(sessionPath(fresh.id));
                    return;
                  }
                  setSessions(next);
                  if (session.id === sessionId) {
                    saveSessions(next, next[0].id);
                    router.push(sessionPath(next[0].id));
                    return;
                  }
                  saveSessions(next, sessionId);
                }}
              >
                ×
              </button>
            </Link>
          ))}
        </div>
        <div className="sidebar-foot">
          文件写在 <code>workspace/</code>
          <br />
          技能在 <code>.cursor/skills</code>
        </div>
      </aside>

      <div className="stage-stack">
        {sessions
          .filter((session) => session.id === active.id || busyIds.includes(session.id))
          .map((session) => (
            <div
              key={session.id}
              className={`stage-slot ${session.id === active.id ? "is-active" : ""}`}
              aria-hidden={session.id !== active.id}
            >
              <ChatPane
                session={session}
                copied={copied}
                onCopyId={() => void copySessionId()}
                settingsRef={settingsRef}
                onSettings={() => setSettingsOpen(true)}
                onSkills={() => setSkillsOpen(true)}
                onBusyChange={(busy) => {
                  setBusyIds((current) => {
                    const has = current.includes(session.id);
                    if (busy) return has ? current : [...current, session.id];
                    if (!has) return current;
                    return current.filter((id) => id !== session.id);
                  });
                }}
                onMessages={(messages) => {
                  if (messages.length === 0) return;
                  saveSessionMessages(session.id, messages);
                  const title = titleFromMessages(messages);
                  setSessions((current) => {
                    const item = current.find((entry) => entry.id === session.id);
                    if (!item || (item.messages === messages && item.title === title)) return current;
                    return current.map((entry) =>
                      entry.id === session.id
                        ? { ...entry, messages, title, updatedAt: Date.now() }
                        : entry,
                    );
                  });
                }}
              />
            </div>
          ))}
      </div>

      {settingsOpen ? (
        <SettingsDialog
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onChange={updateSettings}
        />
      ) : null}
      {skillsOpen ? <SkillsPanel onClose={() => setSkillsOpen(false)} /> : null}
    </div>
  );
}

function ChatPane({
  session,
  copied,
  onCopyId,
  settingsRef,
  onSettings,
  onSkills,
  onMessages,
  onBusyChange,
}: {
  session: AgentSession;
  copied: boolean;
  onCopyId: () => void;
  settingsRef: MutableRefObject<AgentSettings>;
  onSettings: () => void;
  onSkills: () => void;
  onMessages: (messages: UIMessage[]) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [input, setInput] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const chat = getSessionChat(session.id, session.messages, () => settingsRef.current);
  const { messages, sendMessage, status, stop, error, clearError } = useChat({
    chat,
  });

  const persist = useRef(onMessages);
  persist.current = onMessages;
  const busyChange = useRef(onBusyChange);
  busyChange.current = onBusyChange;

  const busy = status === "submitted" || status === "streaming";
  const shown = messages.length > 0 ? messages : session.messages;

  useEffect(() => {
    busyChange.current(busy);
  }, [busy]);

  useEffect(() => {
    if (messages.length === 0) return;
    persist.current(messages);
  }, [busy, messages.length]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [shown, status]);

  async function submit(text = input) {
    const next = text.trim();
    if (!next || busy) return;
    setInput("");
    clearError();
    await sendMessage({ text: next });
  }

  return (
    <main className="stage">
      <header className="stage-bar">
        <div>
          <div className="stage-title">{session.title}</div>
          <div className="stage-meta">
            {settingsRef.current.model || "未选择模型"} · {settingsRef.current.preset === "cursor" ? "Cursor 账号" : "外部接口"}
          </div>
          <button type="button" className="session-id" onClick={onCopyId} title="复制 session id">
            session {session.id}
            <span>{copied ? "已复制" : "复制"}</span>
          </button>
        </div>
        <div className="stage-actions">
          <button className="ghost-btn" onClick={onSettings}>
            设置
          </button>
          <button className="ghost-btn" onClick={onSkills}>
            技能
          </button>
        </div>
      </header>

      <div className="transcript" ref={scroller}>
        {shown.length === 0 ? (
          <div className="empty">
            <p className="empty-kicker">把任务交给 OPS大脑</p>
            <h1>运维与事务的本机智能体。</h1>
            <p>
              它不只聊天：会读文件、写代码、打开网页，并在工作区里把事情做完。
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((item) => (
                <button key={item} onClick={() => submit(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : (
          shown.map((message, index) => (
            <article key={message.id} className={`bubble ${message.role}`}>
              <div className="bubble-role">
                {message.role === "user" ? "你" : "OPS大脑"}
              </div>
              <div className="bubble-body">
                {renderMessageParts(
                  message.id,
                  message.parts,
                  busy && message.role === "assistant" && index === shown.length - 1,
                  `${message.role === "user" ? "你" : "OPS大脑"}-第${index + 1}轮.md`,
                )}
              </div>
            </article>
          ))
        )}
        {busy ? <div className="pulse">OPS大脑正在做事…</div> : null}
        {error ? <div className="error-line">{error.message}</div> : null}
      </div>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <textarea
          value={input}
          rows={1}
          placeholder="描述任务，或让它先看看工作区…"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        {busy ? (
          <button type="button" className="send-btn is-stop" onClick={() => stop()}>
            停止
          </button>
        ) : (
          <button type="submit" className="send-btn" disabled={!input.trim()}>
            发送
          </button>
        )}
      </form>
    </main>
  );
}

function SettingsDialog({
  settings,
  onChange,
  onClose,
}: {
  settings: AgentSettings;
  onChange: (settings: AgentSettings) => void;
  onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <section className="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-head">
          <h2>模型设置</h2>
          <button className="ghost-btn" onClick={onClose}>
            关闭
          </button>
        </div>
        <p className="dialog-copy">
          {settings.preset === "cursor"
            ? `正在使用当前 Cursor 账号的 ${settings.model || "grok-4.6"}。密钥保存在本机服务器，不会出现在浏览器里。`
            : "使用任意 OpenAI 兼容接口。密钥只存在这台电脑的浏览器里，请求发往本机 Next.js 再转给模型服务。"}
        </p>
        <label>
          服务商
          <select
            value={settings.preset}
            onChange={(event) => {
              const preset = PROVIDER_PRESETS.find((item) => item.id === event.target.value);
              onChange({
                ...settings,
                preset: event.target.value,
                baseURL: preset?.baseURL || settings.baseURL,
                model: preset?.model || settings.model,
              });
            }}
          >
            {PROVIDER_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
        {settings.preset === "cursor" ? (
          <p className="dialog-copy">API Key：已使用本机 Cursor 凭证</p>
        ) : (
          <label>
            API Key
            <input
              type="password"
              value={settings.apiKey}
              placeholder="sk-..."
              onChange={(event) => onChange({ ...settings, apiKey: event.target.value })}
            />
          </label>
        )}
        {settings.preset === "cursor" ? null : (
          <label>
            Base URL
            <input
              value={settings.baseURL}
              placeholder="https://api.deepseek.com/v1"
              onChange={(event) => onChange({ ...settings, baseURL: event.target.value })}
            />
          </label>
        )}
        <label>
          模型
          <input
            value={settings.model}
            placeholder={settings.preset === "cursor" ? "grok-4.6" : "deepseek-chat"}
            onChange={(event) => onChange({ ...settings, model: event.target.value })}
          />
        </label>
        <button className="send-btn dialog-save" onClick={onClose}>
          保存并开始
        </button>
      </section>
    </div>
  );
}
