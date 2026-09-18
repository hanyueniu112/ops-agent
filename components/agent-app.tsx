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
import { DreamPanel } from "@/components/dream-panel";
import {
  disposeSessionChat,
  getSessionChat,
  isSessionChatBusy,
  peekSessionChat,
  subscribeSessionChats,
} from "@/lib/session-chats";
import {
  createSession,
  deleteSession,
  fetchMe,
  getSession,
  listSessions,
  logoutUser,
  migrateLegacySessions,
  parseSessionRef,
  rememberSession,
  saveSessionMessages,
  sessionPath,
  updateSessionVisibility,
  type AgentSession,
  type AuthUser,
  type SessionVisibility,
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
  "立刻跑一轮 Dream，把公共会话整理进记忆",
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [dreamOpen, setDreamOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [jumpValue, setJumpValue] = useState("");
  const [jumpHint, setJumpHint] = useState("");
  const [copied, setCopied] = useState(false);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [accessError, setAccessError] = useState("");
  const [detailReady, setDetailReady] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  async function refreshSessions() {
    const listed = await listSessions();
    setSessions((current) => {
      const messagesById = new Map(current.map((item) => [item.id, item.messages]));
      return listed.map((item) => ({
        ...item,
        messages: messagesById.get(item.id) || item.messages,
      }));
    });
    return listed;
  }

  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    if (loaded.preset !== "cursor" && !loaded.apiKey) setSettingsOpen(true);
    void (async () => {
      try {
        await migrateLegacySessions();
        const me = await fetchMe();
        setUser(me);
        await refreshSessions();
      } catch (error) {
        setAccessError(error instanceof Error ? error.message : "加载失败");
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated || !sessionId) return;
    let cancelled = false;
    setDetailReady(false);
    rememberSession(sessionId);
    void (async () => {
      try {
        const session = await getSession(sessionId);
        if (cancelled) return;
        setAccessError("");
        setSessions((current) => {
          const others = current.filter((item) => item.id !== session.id);
          return [session, ...others].sort((a, b) => b.updatedAt - a.updatedAt);
        });
        setDetailReady(true);
      } catch (error) {
        if (cancelled) return;
        setAccessError(error instanceof Error ? error.message : "无法打开会话");
        setDetailReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, sessionId]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setInterval(() => {
      void refreshSessions();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !sessionId) return;
    const timer = window.setInterval(() => {
      if (isSessionChatBusy(sessionId)) return;
      void getSession(sessionId)
        .then((session) => {
          setSessions((current) =>
            current.map((item) => (item.id === session.id ? { ...item, ...session } : item)),
          );
        })
        .catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hydrated, sessionId]);

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
      const title = titleFromMessages(messages);
      saveSessionMessages(id, messages, title);
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
  const publicSessions = sessions.filter((session) => session.visibility === "public");
  const personalSessions = sessions.filter((session) => session.visibility === "personal");

  function updateSettings(next: AgentSettings) {
    setSettings(next);
    saveSettings(next);
  }

  function openSession(id: string) {
    if (!id || id === sessionId) return;
    rememberSession(id);
    router.push(sessionPath(id));
  }

  async function startSession(visibility: SessionVisibility) {
    const session = await createSession({ visibility });
    setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)]);
    router.push(sessionPath(session.id));
  }

  async function jumpToSession(event: FormEvent) {
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
    try {
      await getSession(id);
      setJumpHint("");
      setJumpValue("");
      openSession(id);
    } catch (error) {
      setJumpHint(error instanceof Error ? error.message : "无法打开会话");
    }
  }

  async function copySessionId() {
    if (!sessionId) return;
    await navigator.clipboard.writeText(sessionId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  async function removeSession(session: AgentSession) {
    await deleteSession(session.id);
    disposeSessionChat(session.id);
    setBusyIds((current) => current.filter((id) => id !== session.id));
    const listed = (await refreshSessions()).filter((item) => item.id !== session.id);
    if (session.id !== sessionId) return;
    if (listed[0]) {
      router.push(sessionPath(listed[0].id));
      return;
    }
    const fresh = await createSession({ visibility: "personal" });
    setSessions([fresh]);
    router.push(sessionPath(fresh.id));
  }

  function renderSessionLink(session: AgentSession) {
    return (
      <Link
        key={session.id}
        href={sessionPath(session.id)}
        className={`session-item ${session.id === sessionId ? "is-active" : ""}`}
      >
        <span className="session-item-main">
          <span>{session.title}</span>
          {session.visibility === "public" ? (
            <span className="session-owner">{session.ownerName}</span>
          ) : null}
        </span>
        {busyIds.includes(session.id) ? <span className="session-busy">处理中</span> : null}
        {user?.id === session.ownerId ? (
          <button
            type="button"
            className="session-delete"
            aria-label="删除会话"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void removeSession(session);
            }}
          >
            ×
          </button>
        ) : null}
      </Link>
    );
  }

  if (!hydrated) {
    return <div className="app-shell" />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">脑</span>
          <div>
            <div className="brand-name">OPS大脑</div>
            <div className="brand-sub">AIOPS Web 智能体</div>
          </div>
        </div>
        <div className="new-task-row">
          <button className="new-task" onClick={() => void startSession("personal")}>
            个人任务
          </button>
          <button className="ghost-btn" onClick={() => void startSession("public")}>
            公共任务
          </button>
        </div>
        <div className="sidebar-actions">
          <button className="ghost-btn skills-entry" onClick={() => setSkillsOpen(true)}>
            技能
          </button>
          <button className="ghost-btn skills-entry" onClick={() => setDreamOpen(true)}>
            Dream
          </button>
        </div>
        <form className="session-jump" onSubmit={(event) => void jumpToSession(event)}>
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
          <div className="session-group-label">公共会话</div>
          {publicSessions.length === 0 ? <p className="session-empty">还没有公共会话</p> : publicSessions.map(renderSessionLink)}
          <div className="session-group-label">我的会话</div>
          {personalSessions.length === 0 ? <p className="session-empty">还没有个人会话</p> : personalSessions.map(renderSessionLink)}
        </div>
        <div className="sidebar-foot">
          <div>
            {user ? `已登录 ${user.username}` : ""}
            <button
              type="button"
              className="logout-btn"
              onClick={() => {
                void logoutUser().then(() => {
                  window.location.href = "/login";
                });
              }}
            >
              退出
            </button>
          </div>
          文件写在 <code>workspace/</code>
          <br />
          会话保存在服务器
        </div>
      </aside>

      <div className="stage-stack">
        {accessError && !active ? (
          <div className="stage-slot is-active">
            <main className="stage">
              <div className="empty">
                <p className="empty-kicker">打不开这个会话</p>
                <h1>{accessError}</h1>
                <p>公共会话所有登录用户都能打开；个人会话只有创建者能看。</p>
                <div className="suggestions">
                  <button onClick={() => void startSession("personal")}>新建个人任务</button>
                  <button onClick={() => void startSession("public")}>新建公共任务</button>
                </div>
              </div>
            </main>
          </div>
        ) : null}
        {sessions
          .filter(
            (session) =>
              (session.id === active?.id && detailReady) || busyIds.includes(session.id),
          )
          .map((session) => (
            <div
              key={session.id}
              className={`stage-slot ${session.id === active?.id ? "is-active" : ""}`}
              aria-hidden={session.id !== active?.id}
            >
              <ChatPane
                session={session}
                isOwner={user?.id === session.ownerId}
                canWrite={session.visibility === "public" || user?.id === session.ownerId}
                copied={copied}
                onCopyId={() => void copySessionId()}
                onVisibility={(visibility) => {
                  void updateSessionVisibility(session.id, visibility).then((updated) => {
                    setSessions((current) =>
                      current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
                    );
                  });
                }}
                settingsRef={settingsRef}
                onSettings={() => setSettingsOpen(true)}
                onSkills={() => setSkillsOpen(true)}
                onDream={() => setDreamOpen(true)}
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
                  const title = titleFromMessages(messages);
                  saveSessionMessages(session.id, messages, title);
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
      {dreamOpen ? <DreamPanel onClose={() => setDreamOpen(false)} /> : null}
    </div>
  );
}

function ChatPane({
  session,
  isOwner,
  canWrite,
  copied,
  onCopyId,
  onVisibility,
  settingsRef,
  onSettings,
  onSkills,
  onDream,
  onMessages,
  onBusyChange,
}: {
  session: AgentSession;
  isOwner: boolean;
  canWrite: boolean;
  copied: boolean;
  onCopyId: () => void;
  onVisibility: (visibility: SessionVisibility) => void;
  settingsRef: MutableRefObject<AgentSettings>;
  onSettings: () => void;
  onSkills: () => void;
  onDream: () => void;
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
            {session.visibility === "public" ? "公共会话" : "个人会话"}
            {session.ownerName ? ` · ${session.ownerName}` : ""}
            {" · "}
            {settingsRef.current.model || "未选择模型"} · {settingsRef.current.preset === "cursor" ? "Cursor 账号" : "外部接口"}
          </div>
          <button type="button" className="session-id" onClick={onCopyId} title="复制 session id">
            session {session.id}
            <span>{copied ? "已复制" : "复制"}</span>
          </button>
        </div>
        <div className="stage-actions">
          {isOwner ? (
            <button
              className="ghost-btn"
              onClick={() => onVisibility(session.visibility === "public" ? "personal" : "public")}
            >
              {session.visibility === "public" ? "改为个人" : "改为公共"}
            </button>
          ) : session.visibility === "public" ? (
            <span className="stage-meta">公共会话，所有人都能继续问</span>
          ) : (
            <span className="stage-meta">只读</span>
          )}
          <button className="ghost-btn" onClick={onSettings}>
            设置
          </button>
          <button className="ghost-btn" onClick={onSkills}>
            技能
          </button>
          <button className="ghost-btn" onClick={onDream}>
            Dream
          </button>
        </div>
      </header>

      <div className="transcript" ref={scroller}>
        {shown.length === 0 ? (
          <div className="empty">
            <p className="empty-kicker">把任务交给 OPS大脑</p>
            <h1>AIOPS Web 智能体。</h1>
            <p>
              它不只聊天：会读文件、写代码、打开网页，并在工作区里把事情做完。
            </p>
            <div className="suggestions">
              {canWrite
                ? SUGGESTIONS.map((item) => (
                    <button key={item} onClick={() => submit(item)}>
                      {item}
                    </button>
                  ))
                : null}
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

      {canWrite ? (
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
      ) : (
        <div className="composer readonly-composer">这是 {session.ownerName} 的个人会话，只有创建者能发消息。</div>
      )}
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
            ? `正在使用服务端 Cursor 账号的 ${settings.model || "grok-4.6"}。密钥保存在服务器，不会出现在浏览器里。`
            : "使用任意 OpenAI 兼容接口。密钥只存在你的浏览器里，由 OPS大脑转发到模型服务。"}
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
          <p className="dialog-copy">API Key：已使用服务端 Cursor 凭证</p>
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
