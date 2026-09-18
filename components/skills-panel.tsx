"use client";

import { useEffect, useMemo, useState } from "react";

type SkillScope = "project" | "personal";

type SkillGroup = {
  id: string;
  title: string;
  description: string;
};

type SkillSummary = {
  scope: SkillScope;
  group: string;
  name: string;
  description: string;
};

const SCOPE_LABEL: Record<SkillScope, string> = {
  project: "项目",
  personal: "个人",
};

const BUILTIN = new Set(["general", "alert-analysis", "request-call", "log-stream"]);

export function SkillsPanel({ onClose }: { onClose: () => void }) {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [groups, setGroups] = useState<Record<SkillScope, SkillGroup[]>>({
    project: [],
    personal: [],
  });
  const [scope, setScope] = useState<SkillScope>("project");
  const [groupId, setGroupId] = useState("general");
  const [selected, setSelected] = useState<SkillSummary | null>(null);
  const [content, setContent] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftGroupId, setDraftGroupId] = useState("");
  const [draftGroupTitle, setDraftGroupTitle] = useState("");
  const [draftGroupDescription, setDraftGroupDescription] = useState("");
  const [mode, setMode] = useState<"idle" | "skill" | "group">("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const scopeGroups = groups[scope] || [];
  const visible = useMemo(
    () => skills.filter((skill) => skill.scope === scope),
    [skills, scope],
  );

  async function refresh() {
    const response = await fetch("/api/skills");
    const data = (await response.json()) as {
      skills?: SkillSummary[];
      groups?: Record<SkillScope, SkillGroup[]>;
      error?: string;
    };
    if (!response.ok) {
      setError(data.error || "无法加载技能");
      return;
    }
    setSkills(data.skills || []);
    if (data.groups) setGroups(data.groups);
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!scopeGroups.some((item) => item.id === groupId)) {
      setGroupId(scopeGroups[0]?.id || "general");
    }
  }, [scope, scopeGroups, groupId]);

  async function openSkill(skill: SkillSummary) {
    setMode("idle");
    setError("");
    const response = await fetch(
      `/api/skills?scope=${skill.scope}&group=${encodeURIComponent(skill.group)}&name=${encodeURIComponent(skill.name)}`,
    );
    const data = (await response.json()) as { content?: string; error?: string };
    if (!response.ok) {
      setError(data.error || "读取失败");
      return;
    }
    setSelected(skill);
    setGroupId(skill.group);
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
        group: selected.group,
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
        group: groupId,
        name: draftName.trim(),
        description: draftDescription.trim(),
      }),
    });
    const data = (await response.json()) as { name?: string; error?: string };
    if (!response.ok) {
      setError(data.error || "创建失败");
      return;
    }
    setMode("idle");
    setDraftName("");
    setDraftDescription("");
    await refresh();
    await openSkill({
      scope,
      group: groupId,
      name: data.name || draftName.trim(),
      description: draftDescription,
    });
  }

  async function createGroup() {
    setError("");
    const response = await fetch("/api/skills", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_group",
        scope,
        id: draftGroupId.trim(),
        title: draftGroupTitle.trim(),
        description: draftGroupDescription.trim(),
      }),
    });
    const data = (await response.json()) as { error?: string; group?: SkillGroup };
    if (!response.ok) {
      setError(data.error || "创建分组失败");
      return;
    }
    setMode("idle");
    setDraftGroupId("");
    setDraftGroupTitle("");
    setDraftGroupDescription("");
    await refresh();
    if (data.group) setGroupId(data.group.id);
  }

  async function removeGroup(id: string) {
    if (!window.confirm(`删除分组 ${id}？`)) return;
    const response = await fetch("/api/skills", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_group", scope, id }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "删除分组失败");
      return;
    }
    if (groupId === id) setGroupId("general");
    setSelected(null);
    await refresh();
  }

  async function remove() {
    if (!selected) return;
    if (!window.confirm(`删除技能 ${selected.name}？`)) return;
    const response = await fetch(
      `/api/skills?scope=${selected.scope}&group=${encodeURIComponent(selected.group)}&name=${encodeURIComponent(selected.name)}`,
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

  const groupTitle = scopeGroups.find((item) => item.id === selected?.group)?.title || selected?.group;

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
          技能按分组存放：告警分析、请求调用、日志流、通用。项目技能给这个工作区用，个人技能给本机所有项目用。
        </p>
        <div className="skills-layout">
          <aside className="skills-nav">
            <div className="skills-tabs">
              <button
                className={scope === "project" ? "is-active" : ""}
                onClick={() => {
                  setScope("project");
                  setMode("idle");
                }}
              >
                项目
              </button>
              <button
                className={scope === "personal" ? "is-active" : ""}
                onClick={() => {
                  setScope("personal");
                  setMode("idle");
                }}
              >
                个人
              </button>
            </div>
            <div className="skills-nav-actions">
              <button
                className="ghost-btn"
                onClick={() => {
                  setMode("skill");
                  setSelected(null);
                  setStatus("");
                }}
              >
                新建技能
              </button>
              <button
                className="ghost-btn"
                onClick={() => {
                  setMode("group");
                  setSelected(null);
                  setStatus("");
                }}
              >
                新建分组
              </button>
            </div>
            <div className="skills-list">
              {scopeGroups.length === 0 ? <p className="dialog-copy">还没有分组</p> : null}
              {scopeGroups.map((group) => {
                const items = visible.filter((skill) => skill.group === group.id);
                return (
                  <div key={group.id} className="skill-group">
                    <div className="skill-group-head">
                      <button
                        type="button"
                        className={`skill-group-title ${groupId === group.id ? "is-active" : ""}`}
                        onClick={() => setGroupId(group.id)}
                      >
                        {group.title}
                        <span>{items.length}</span>
                      </button>
                      {!BUILTIN.has(group.id) ? (
                        <button
                          type="button"
                          className="session-delete"
                          aria-label={`删除分组 ${group.title}`}
                          onClick={() => void removeGroup(group.id)}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                    {group.description ? <p className="skill-group-desc">{group.description}</p> : null}
                    {items.map((skill) => (
                      <button
                        key={`${skill.scope}-${skill.group}-${skill.name}`}
                        className={`session-item ${selected?.name === skill.name && selected.scope === skill.scope && selected.group === skill.group ? "is-active" : ""}`}
                        onClick={() => void openSkill(skill)}
                      >
                        <span>{skill.name}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </aside>
          <div className="skills-editor">
            {mode === "skill" ? (
              <>
                <label>
                  分组
                  <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                    {scopeGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  名称
                  <input
                    value={draftName}
                    placeholder="alert-triage"
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
            ) : mode === "group" ? (
              <>
                <label>
                  分组 id
                  <input
                    value={draftGroupId}
                    placeholder="change-review"
                    onChange={(event) => setDraftGroupId(event.target.value)}
                  />
                </label>
                <label>
                  标题
                  <input
                    value={draftGroupTitle}
                    placeholder="变更评审"
                    onChange={(event) => setDraftGroupTitle(event.target.value)}
                  />
                </label>
                <label>
                  说明
                  <input
                    value={draftGroupDescription}
                    placeholder="这个分组放什么技能"
                    onChange={(event) => setDraftGroupDescription(event.target.value)}
                  />
                </label>
                <button
                  className="send-btn"
                  onClick={() => void createGroup()}
                  disabled={!draftGroupId || !draftGroupTitle}
                >
                  创建分组
                </button>
              </>
            ) : selected ? (
              <>
                <div className="skills-editor-meta">
                  <strong>{selected.name}</strong>
                  <span>
                    {SCOPE_LABEL[selected.scope]} · {groupTitle}
                  </span>
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
              <p className="dialog-copy">选择左侧分组里的技能查看和编辑 SKILL.md，或新建技能 / 分组。</p>
            )}
            {error ? <p className="error-line">{error}</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
