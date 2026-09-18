import type { UIMessage } from "ai";
import { getDb } from "@/lib/db";
import {
  appendDreamDiary,
  memoryPromptSnippet,
  readMemoryMarkdown,
  writeMemoryMarkdown,
} from "@/lib/memory";
import { lastPublicSessionUpdate, listPublicSessionsForDream } from "@/lib/session-store";
import { listSkills } from "@/lib/skills";

export type DreamCandidate = {
  text: string;
  source: string;
  score: number;
  reasons: string[];
};

export type DreamRun = {
  id: string;
  trigger: string;
  status: string;
  phase: string;
  startedAt: number;
  finishedAt: number | null;
  summary: string;
  diary: string;
  candidates: DreamCandidate[];
};

type DreamRow = {
  id: string;
  trigger: string;
  status: string;
  phase: string;
  started_at: number;
  finished_at: number | null;
  summary: string;
  diary: string;
  candidates_json: string;
};

const HINTS = ["记住", "以后", "默认", "告警", "日志", "调用", "接口", "根因", "排障", "必须", "不要"];

function mapRun(row: DreamRow): DreamRun {
  let candidates: DreamCandidate[] = [];
  try {
    candidates = JSON.parse(row.candidates_json) as DreamCandidate[];
  } catch {
    candidates = [];
  }
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    phase: row.phase,
    startedAt: Number(row.started_at),
    finishedAt: row.finished_at == null ? null : Number(row.finished_at),
    summary: row.summary,
    diary: row.diary,
    candidates,
  };
}

export function lastDreamRun() {
  const row = getDb()
    .prepare("SELECT * FROM dream_runs ORDER BY started_at DESC LIMIT 1")
    .get() as DreamRow | undefined;
  return row ? mapRun(row) : null;
}

export function listDreamRuns(limit = 8) {
  const rows = getDb()
    .prepare("SELECT * FROM dream_runs ORDER BY started_at DESC LIMIT ?")
    .all(limit) as DreamRow[];
  return rows.map(mapRun);
}

function messageText(messages: UIMessage[]) {
  const chunks: string[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = message.parts
      .filter((part) => part.type === "text" && "text" in part)
      .map((part) => ("text" in part ? part.text : ""))
      .join("\n")
      .trim();
    if (text.length >= 24) chunks.push(text.replace(/\s+/g, " ").slice(0, 280));
  }
  return chunks;
}

function scoreText(text: string, recency: number, freq: number): DreamCandidate {
  const reasons: string[] = [];
  let score = 0.12 + Math.min(0.15, recency) + Math.min(0.24, freq * 0.08);
  if (text.length > 80) {
    score += 0.06;
    reasons.push("信息密度");
  }
  for (const hint of HINTS) {
    if (text.includes(hint)) {
      score += 0.08;
      reasons.push(hint);
    }
  }
  if (/https?:\/\//.test(text) || /\b\d{3,5}\b/.test(text)) {
    score += 0.05;
    reasons.push("可复查细节");
  }
  return { text, source: "", score: Math.min(1, score), reasons };
}

function lightSleep(sessions: ReturnType<typeof listPublicSessionsForDream>) {
  const now = Date.now();
  const freq = new Map<string, number>();
  const staged: DreamCandidate[] = [];
  for (const session of sessions) {
    const recency = Math.max(0, 1 - (now - session.updatedAt) / (7 * 24 * 60 * 60 * 1000));
    for (const text of messageText(session.messages)) {
      const key = text.slice(0, 80);
      freq.set(key, (freq.get(key) || 0) + 1);
      const candidate = scoreText(text, recency, freq.get(key) || 1);
      candidate.source = session.title;
      staged.push(candidate);
    }
  }
  staged.sort((a, b) => b.score - a.score);
  const unique: DreamCandidate[] = [];
  const seen = new Set<string>();
  for (const item of staged) {
    const key = item.text.slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= 12) break;
  }
  return unique;
}

function remSleep(candidates: DreamCandidate[], skillNames: string[]) {
  const themes = [...new Set(candidates.flatMap((item) => item.reasons).filter((item) => HINTS.includes(item)))];
  const top = candidates.slice(0, 5).map((item) => `- ${item.text.slice(0, 120)}（来自 ${item.source}）`);
  const when = new Date().toLocaleString("zh-CN", { hour12: false });
  return `## ${when} · REM

主题：${themes.join("、") || "近期公共会话回放"}
技能库：${skillNames.slice(0, 12).join("、") || "尚无"}
浅睡候选 ${candidates.length} 条。

${top.join("\n") || "- 没有足够长的公共会话可供整理"}
`;
}

function deepSleep(existing: string, candidates: DreamCandidate[]) {
  const promoted = candidates.filter((item) => item.score >= 0.42).slice(0, 8);
  if (promoted.length === 0) {
    return { markdown: existing.trim() || "# OPS 长期记忆\n\n还没有沉淀。Dream 之后会把高价值公共会话写到这里。\n", wrote: 0 };
  }
  const kept = existing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
  const next = [...kept];
  for (const item of promoted) {
    const line = `- ${item.text}`;
    if (next.some((current) => current.includes(item.text.slice(0, 40)))) continue;
    next.unshift(line);
  }
  const markdown = `# OPS 长期记忆

由 Dream 深睡阶段从公共会话整理。只保留对以后排障/操作仍有用的条目。

${next.slice(0, 40).join("\n")}
`;
  return { markdown, wrote: promoted.length };
}

export async function runDreamCycle(trigger: "manual" | "auto") {
  const running = getDb()
    .prepare("SELECT id FROM dream_runs WHERE status = 'running' LIMIT 1")
    .get() as { id: string } | undefined;
  if (running) {
    throw new Error("已有 Dream 正在进行");
  }

  const last = lastDreamRun();
  if (trigger === "auto" && last?.finishedAt && Date.now() - last.finishedAt < 6 * 60 * 60 * 1000) {
    return last;
  }

  const id = crypto.randomUUID();
  const started = Date.now();
  getDb()
    .prepare(
      `INSERT INTO dream_runs (id, trigger, status, phase, started_at, finished_at, summary, diary, candidates_json)
       VALUES (?, ?, 'running', 'light', ?, NULL, '', '', '[]')`,
    )
    .run(id, trigger, started);

  try {
    const sessions = listPublicSessionsForDream();
    const candidates = lightSleep(sessions);
    getDb().prepare("UPDATE dream_runs SET phase = 'rem' WHERE id = ?").run(id);

    const skills = await listSkills("project");
    const diary = remSleep(
      candidates,
      skills.map((item) => `${item.group}/${item.name}`),
    );
    await appendDreamDiary(diary);
    getDb().prepare("UPDATE dream_runs SET phase = 'deep' WHERE id = ?").run(id);

    const existing = await readMemoryMarkdown();
    const deep = deepSleep(existing, candidates);
    await writeMemoryMarkdown(deep.markdown);

    const summary = `浅睡 ${candidates.length} 条候选，深睡写入 ${deep.wrote} 条。扫描公共会话 ${sessions.length} 个。`;
    getDb()
      .prepare(
        `UPDATE dream_runs
         SET status = 'done', phase = 'done', finished_at = ?, summary = ?, diary = ?, candidates_json = ?
         WHERE id = ?`,
      )
      .run(Date.now(), summary, diary, JSON.stringify(candidates), id);
    return lastDreamRun();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dream 失败";
    getDb()
      .prepare(
        `UPDATE dream_runs SET status = 'error', finished_at = ?, summary = ? WHERE id = ?`,
      )
      .run(Date.now(), message, id);
    throw error;
  }
}

export async function dreamStatus() {
  return {
    last: lastDreamRun(),
    runs: listDreamRuns(),
    memory: await memoryPromptSnippet(),
    lastPublicUpdate: lastPublicSessionUpdate(),
  };
}

type GlobalDream = typeof globalThis & { __opsDreamTimer?: ReturnType<typeof setInterval> };

export function ensureDreamScheduler() {
  const globalDream = globalThis as GlobalDream;
  if (globalDream.__opsDreamTimer) return;
  globalDream.__opsDreamTimer = setInterval(() => {
    const lastChat = lastPublicSessionUpdate();
    if (!lastChat) return;
    if (Date.now() - lastChat < 30 * 60 * 1000) return;
    const last = lastDreamRun();
    if (last?.status === "running") return;
    if (last?.finishedAt && Date.now() - last.finishedAt < 6 * 60 * 60 * 1000) return;
    void runDreamCycle("auto").catch(() => {});
  }, 60_000);
  globalDream.__opsDreamTimer.unref?.();
}
