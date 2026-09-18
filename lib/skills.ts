import { mkdir, readdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { workspaceRoot } from "@/lib/workspace";

export type SkillScope = "project" | "personal";

export type SkillGroup = {
  id: string;
  title: string;
  description: string;
};

export type SkillSummary = {
  scope: SkillScope;
  group: string;
  name: string;
  description: string;
  path: string;
};

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const DEFAULT_GROUPS: SkillGroup[] = [
  { id: "general", title: "通用", description: "默认分组，放跨场景技能" },
  { id: "alert-analysis", title: "告警分析", description: "告警归并、降噪、根因初判" },
  { id: "request-call", title: "请求调用", description: "HTTP/RPC 排查、重试、调用约定" },
  { id: "log-stream", title: "日志流", description: "日志检索、关联、异常流分析" },
];

export function projectSkillsRoot() {
  return path.join(workspaceRoot(), ".cursor", "skills");
}

export function personalSkillsRoot() {
  return path.join(homedir(), ".cursor", "skills");
}

export function skillsRoot(scope: SkillScope) {
  return scope === "personal" ? personalSkillsRoot() : projectSkillsRoot();
}

export function assertSkillName(name: string) {
  if (!NAME_RE.test(name)) {
    throw new Error("名称只能用小写字母、数字和连字符，最长 64 个字符");
  }
}

function assertSafeName(name: string) {
  assertSkillName(name);
  if (name === "skills-cursor" || name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error("非法名称");
  }
}

function groupsFile(scope: SkillScope) {
  return path.join(skillsRoot(scope), "groups.json");
}

export async function ensureSkillsDirs() {
  await mkdir(projectSkillsRoot(), { recursive: true });
  await mkdir(personalSkillsRoot(), { recursive: true });
  for (const scope of ["project", "personal"] as const) {
    const groups = await readGroups(scope);
    for (const group of groups) {
      await mkdir(path.join(skillsRoot(scope), group.id), { recursive: true });
    }
  }
}

export async function readGroups(scope: SkillScope): Promise<SkillGroup[]> {
  await mkdir(skillsRoot(scope), { recursive: true });
  try {
    const raw = JSON.parse(await readFile(groupsFile(scope), "utf8")) as { groups?: SkillGroup[] };
    const extra = (raw.groups || []).filter((item) => NAME_RE.test(item.id));
    const map = new Map(DEFAULT_GROUPS.map((item) => [item.id, item]));
    for (const item of extra) {
      map.set(item.id, {
        id: item.id,
        title: item.title || item.id,
        description: item.description || "",
      });
    }
    return [...map.values()];
  } catch {
    await writeGroups(scope, DEFAULT_GROUPS);
    return DEFAULT_GROUPS;
  }
}

async function writeGroups(scope: SkillScope, groups: SkillGroup[]) {
  await mkdir(skillsRoot(scope), { recursive: true });
  await writeFile(groupsFile(scope), `${JSON.stringify({ groups }, null, 2)}\n`, "utf8");
}

export async function createGroup(scope: SkillScope, input: { id: string; title: string; description?: string }) {
  assertSafeName(input.id);
  const groups = await readGroups(scope);
  if (groups.some((item) => item.id === input.id)) {
    throw new Error("同名分组已经存在");
  }
  const next = [
    ...groups,
    { id: input.id, title: input.title.trim() || input.id, description: (input.description || "").trim() },
  ];
  await writeGroups(scope, next);
  await mkdir(path.join(skillsRoot(scope), input.id), { recursive: true });
  return next.find((item) => item.id === input.id)!;
}

export async function deleteGroup(scope: SkillScope, id: string) {
  assertSafeName(id);
  if (DEFAULT_GROUPS.some((item) => item.id === id)) {
    throw new Error("内置分组不能删除");
  }
  const skills = (await listSkills(scope)).filter((item) => item.group === id);
  if (skills.length > 0) {
    throw new Error("分组里还有技能，先移走或删除技能");
  }
  const groups = (await readGroups(scope)).filter((item) => item.id !== id);
  await writeGroups(scope, groups);
  await rm(path.join(skillsRoot(scope), id), { recursive: true, force: true });
  return { ok: true, scope, id };
}

export function skillDir(scope: SkillScope, group: string, name: string) {
  assertSafeName(group);
  assertSafeName(name);
  return path.join(skillsRoot(scope), group, name);
}

function parseFrontmatter(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const meta: Record<string, string> = {};
  if (!match) return { meta, body: content };
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    meta[key] = value;
  }
  return { meta, body: content.slice(match[0].length).replace(/^\r?\n/, "") };
}

async function summarizeFile(
  scope: SkillScope,
  group: string,
  dirName: string,
  relativeDir: string,
): Promise<SkillSummary | null> {
  const file = path.join(skillsRoot(scope), relativeDir, "SKILL.md");
  try {
    const content = await readFile(file, "utf8");
    const { meta } = parseFrontmatter(content);
    return {
      scope,
      group: meta.group || group,
      name: meta.name || dirName,
      description: meta.description || "",
      path: path.join(".cursor", "skills", relativeDir, "SKILL.md").replaceAll("\\", "/"),
    };
  } catch {
    return null;
  }
}

export async function listSkills(scopeFilter?: SkillScope): Promise<SkillSummary[]> {
  await ensureSkillsDirs();
  const out: SkillSummary[] = [];
  const scopes = scopeFilter ? [scopeFilter] : (["project", "personal"] as const);
  for (const scope of scopes) {
    const root = skillsRoot(scope);
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const legacySkill = path.join(root, entry.name, "SKILL.md");
      const hasLegacy = await stat(legacySkill)
        .then(() => true)
        .catch(() => false);
      if (hasLegacy) {
        const summary = await summarizeFile(scope, "general", entry.name, entry.name);
        if (summary) out.push(summary);
        continue;
      }
      const children = await readdir(path.join(root, entry.name), { withFileTypes: true }).catch(() => []);
      for (const child of children) {
        if (!child.isDirectory()) continue;
        const summary = await summarizeFile(
          scope,
          entry.name,
          child.name,
          path.join(entry.name, child.name),
        );
        if (summary) out.push(summary);
      }
    }
  }
  return out.sort(
    (a, b) =>
      a.scope.localeCompare(b.scope) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name),
  );
}

async function exists(file: string) {
  return stat(file)
    .then(() => true)
    .catch(() => false);
}

export async function resolveSkillDir(scope: SkillScope, name: string, group = "general") {
  assertSafeName(name);
  assertSafeName(group);
  const grouped = skillDir(scope, group, name);
  if (await exists(path.join(grouped, "SKILL.md"))) return grouped;
  const legacy = path.join(skillsRoot(scope), name);
  if (await exists(path.join(legacy, "SKILL.md"))) return legacy;
  return grouped;
}

export async function readSkill(scope: SkillScope, name: string, fileName = "SKILL.md", group = "general") {
  if (path.basename(fileName) !== fileName || fileName.includes("..")) {
    throw new Error("非法文件名");
  }
  const dir = await resolveSkillDir(scope, name, group);
  const content = await readFile(path.join(dir, fileName), "utf8");
  const files = (await readdir(dir)).filter((item) => item !== ".git");
  return { scope, group, name, fileName, content, files };
}

export function skillTemplate(name: string, description: string, group: string) {
  return `---
name: ${name}
description: ${description}
group: ${group}
---

# ${name}

## 何时使用
描述触发这个技能的场景。

## 步骤
1. 
2. 
3. 
`;
}

export async function writeSkill(
  scope: SkillScope,
  name: string,
  content: string,
  fileName = "SKILL.md",
  group = "general",
) {
  assertSafeName(name);
  assertSafeName(group);
  if (path.basename(fileName) !== fileName || fileName.includes("..")) {
    throw new Error("非法文件名");
  }
  await ensureSkillsDirs();
  const dir = skillDir(scope, group, name);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, fileName);
  await writeFile(file, content, "utf8");
  return { scope, group, name, fileName, bytes: Buffer.byteLength(content, "utf8") };
}

export async function createSkill(scope: SkillScope, name: string, description: string, group = "general") {
  assertSafeName(name);
  assertSafeName(group);
  if (!description.trim()) {
    throw new Error("需要填写 description，方便 Agent 判断何时使用");
  }
  await ensureSkillsDirs();
  const groups = await readGroups(scope);
  if (!groups.some((item) => item.id === group)) {
    throw new Error("分组不存在，请先创建分组");
  }
  const dir = skillDir(scope, group, name);
  const existing = await readdir(dir).catch(() => null);
  if (existing) {
    throw new Error("同名技能已经存在");
  }
  return writeSkill(scope, name, skillTemplate(name, description.trim(), group), "SKILL.md", group);
}

export async function deleteSkill(scope: SkillScope, name: string, group = "general") {
  const dir = await resolveSkillDir(scope, name, group);
  await rm(dir, { recursive: true, force: false });
  return { ok: true, scope, group, name };
}
