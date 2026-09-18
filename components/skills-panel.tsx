"use client";

import { useEffect, useState } from "react";

type SkillScope = "project" | "personal";

type SkillSummary = {
  scope: SkillScope;
  name: string;
  description: string;
};

const SCOPE_LABEL: Record<SkillScope, string> = {
  project: "项目",
  personal: "个人",
};

export function SkillsPanel({ onClose }: { onClose: () => void }) {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [scope, setScope] = useState<SkillScope>("project");
  const [selected, setSelected] = useState<SkillSummary | null>(null);
  const [content, setContent] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const response = await fetch("/api/skills");
    const data = (await response.json()) as { skills?: SkillSummary[]; error?: string };
    if (!response.ok) {
      setError(data.error || "无法加载技能");
      return;
    }
    setSkills(data.skills || []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function openSkill(skill: SkillSummary) {
    setCreating(false);
    setError("");
    const response = await fetch(
      `/api/skills?scope=${skill.scope}&name=${encodeURIComponent(skill.name)}`,
    );
    const data = (await response.json()) as { content?: string; error?: string };
    if (!response.ok) {
      setError(data.error || "读取失败");
      return;
    }
    setSelected(skill);
    setContent(data.content || "");
  }

  async function save() {
    if (!selected) return;
    setError("");
    const response = await fetch("/api/skills", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: selected.scope,
        name: selected.name,
        content,
      }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "保存失败");
      return;
    }
    setStatus("已保存");
    await refresh();
  }

  async function create() {
    setError("");
    const response = await fetch("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope,
        name: draftName.trim(),
        description: draftDescription.trim(),
      }),
    });
    const data = (await response.json()) as { name?: string; error?: string };
    if (!response.ok) {
      setError(data.error || "创建失败");
      return;
    }
    setCreating(false);
    setDraftName("");
    setDraftDescription("");
    await refresh();
    await openSkill({ scope, name: data.name || draftName.trim(), description: draftDescription });
  }

  async function remove() {
    if (!selected) return;
    if (!window.confirm(`删除技能 ${selected.name}？`)) return;
    const response = await fetch(
      `/api/skills?scope=${selected.scope}&name=${encodeURIComponent(selected.name)}`,
      { method: "DELETE" },
    );
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "删除失败");
      return;
    }
    setSelected(null);
    setContent("");
    await refresh();
  }

  const visible = skills.filter((skill) => skill.scope === scope);

  return (
    <div className="overlay" onClick={onClose}>
      <section className="skills-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-head">
          <h2>技能</h2>
          <button className="ghost-btn" onClick={onClose}>
            关闭
          </button>
        </div>
        <p className="dialog-copy">
          项目技能给这个工作区用，个人技能给本机所有项目用。保存后，OPS大脑会读取 SKILL.md。
        </p>
        <div className="skills-layout">
          <aside className="skills-nav">
            <div className="skills-tabs">
              <button
                className={scope === "project" ? "is-active" : ""}
                onClick={() => {
                  setScope("project");
                  setCreating(false);
                }}
              >
                项目
              </button>
              <button
                className={scope === "personal" ? "is-active" : ""}
                onClick={() => {
                  setScope("personal");
                  setCreating(false);
                }}
              >
                个人
              </button>
            </div>
            <button
              className="ghost-btn"
              onClick={() => {
                setCreating(true);
                setSelected(null);
                setStatus("");
              }}
            >
              新建技能
            </button>
            <div className="skills-list">
              {visible.length === 0 ? <p className="dialog-copy">还没有技能</p> : null}
              {visible.map((skill) => (
                <button
                  key={`${skill.scope}-${skill.name}`}
                  className={`session-item ${selected?.name === skill.name && selected.scope === skill.scope ? "is-active" : ""}`}
                  onClick={() => void openSkill(skill)}
                >
                  <span>{skill.name}</span>
                </button>
              ))}
            </div>
          </aside>
          <div className="skills-editor">
            {creating ? (
              <>
                <label>
                  名称
                  <input
                    value={draftName}
                    placeholder="code-review"
                    onChange={(event) => setDraftName(event.target.value)}
                  />
                </label>
                <label>
                  描述
                  <input
                    value={draftDescription}
                    placeholder="第三人称：做什么，以及何时使用"
                    onChange={(event) => setDraftDescription(event.target.value)}
                  />
                </label>
                <button className="send-btn" onClick={() => void create()} disabled={!draftName || !draftDescription}>
                  创建
                </button>
              </>
            ) : selected ? (
              <>
                <div className="skills-editor-meta">
                  <strong>{selected.name}</strong>
                  <span>{SCOPE_LABEL[selected.scope]}</span>
                </div>
                <textarea
                  className="skills-textarea"
                  value={content}
                  onChange={(event) => {
                    setContent(event.target.value);
                    setStatus("");
                  }}
                />
                <div className="skills-actions">
                  <button className="send-btn" onClick={() => void save()}>
                    保存
                  </button>
                  <button className="ghost-btn" onClick={() => void remove()}>
                    删除
                  </button>
                  {status ? <span className="dialog-copy">{status}</span> : null}
                </div>
              </>
            ) : (
              <p className="dialog-copy">选择左侧技能查看和编辑 SKILL.md，或新建一个。</p>
            )}
            {error ? <p className="error-line">{error}</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
