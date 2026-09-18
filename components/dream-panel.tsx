"use client";

import { useEffect, useState } from "react";

type DreamCandidate = {
  text: string;
  source: string;
  score: number;
  reasons: string[];
};

type DreamRun = {
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

type DreamStatus = {
  last: DreamRun | null;
  runs: DreamRun[];
  memory: string;
  lastPublicUpdate: number | null;
};

function formatTime(value: number | null) {
  if (!value) return "还没有";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function DreamPanel({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<DreamStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const response = await fetch("/api/dream");
    const payload = (await response.json()) as DreamStatus & { error?: string };
    if (!response.ok) {
      setError(payload.error || "无法读取 Dream");
      return;
    }
    setData(payload);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function runNow() {
    setRunning(true);
    setError("");
    const response = await fetch("/api/dream", { method: "POST" });
    const payload = (await response.json()) as { error?: string; status?: DreamStatus };
    setRunning(false);
    if (!response.ok) {
      setError(payload.error || "整理失败");
      return;
    }
    if (payload.status) setData(payload.status);
    else await refresh();
  }

  const last = data?.last;

  return (
    <div className="overlay" onClick={onClose}>
      <section className="skills-dialog dream-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-head">
          <h2>Dream</h2>
          <button className="ghost-btn" onClick={onClose}>
            关闭
          </button>
        </div>
        <p className="dialog-copy">
          安静时自动整理<strong>公共会话</strong>：浅睡筛候选，REM 写日记，深睡写入长期记忆。个人会话不会进入记忆。
        </p>
        <div className="dream-toolbar">
          <button className="send-btn" onClick={() => void runNow()} disabled={running}>
            {running ? "整理中…" : "立刻整理"}
          </button>
          <span className="dialog-copy">
            上次公共会话更新 {formatTime(data?.lastPublicUpdate ?? null)}
            {last ? ` · Dream ${last.status === "done" ? formatTime(last.finishedAt) : last.phase}` : ""}
          </span>
        </div>
        {error ? <p className="error-line">{error}</p> : null}
        <div className="dream-grid">
          <article className="dream-card">
            <h3>长期记忆</h3>
            <pre className="dream-pre">{data?.memory?.trim() || "还没有沉淀。整理公共会话后会出现在这里。"}</pre>
          </article>
          <article className="dream-card">
            <h3>最近一轮</h3>
            {last ? (
              <>
                <p className="dialog-copy">
                  {last.trigger === "manual" ? "手动" : "自动"} · {last.summary || last.status}
                </p>
                <pre className="dream-pre">{last.diary.trim() || "没有日记。"}</pre>
              </>
            ) : (
              <p className="dialog-copy">还没有跑过 Dream。</p>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
