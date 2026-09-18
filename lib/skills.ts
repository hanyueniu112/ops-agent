import { homedir } from "node:os";
import path from "node:path";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { workspaceRoot } from "@/lib/workspace";

export type SkillScope = "project" | "personal";

export type SkillSummary = {
  scope: SkillScope;
  name: string;
  description: string;
  path: string;
};

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function projectSkillsRoot() {
  return path.join(workspaceRoot(), ".cursor", "skills");
}

export function personalSkillsRoot() {
  return path.join(homedir(), ".cursor", "skills");
}

export function skillsRoot(scope: SkillScope) {
  return scope === "personal" ? personalSkillsRoot() : projectSkillsRoot();
}

export async function ensureSkillsDirs() {
  await mkdir(projectSkillsRoot(), { recursive: true });
  await mkdir(personalSkillsRoot(), { recursive: true });
}

export function assertSkillName(name: string) {
  if (!NAME_RE.test(name)) {
    throw new Error("技能名只能用小写字母、数字和连字符，最长 64 个字符");
  }
}

function assertSafeName(name: string) {
  assertSkillName(name);
  if (name === "skills-cursor" || name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error("非法技能名");
  }
}

export function skillDir(scope: SkillScope, name: string) {
  assertSafeName(name);
  return path.join(skillsRoot(scope), name);
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

async function summarizeDir(scope: SkillScope, dirName: string): Promise<SkillSummary | null> {
  const file = path.join(skillsRoot(scope), dirName, "SKILL.md");
  try {
    const content = await readFile(file, "utf8");
    const { meta } = parseFrontmatter(content);
    return {
      scope,
      name: meta.name || dirName,
      description: meta.description || "",
      path: path.join(".cursor", "skills", dirName, "SKILL.md").replaceAll("\\", "/"),
    };
  } catch {
    return null;
  }
}

export async function listSkills(): Promise<SkillSummary[]> {
  await ensureSkillsDirs();
  const out: SkillSummary[] = [];
  for (const scope of ["project", "personal"] as const) {
    const entries = await readdir(skillsRoot(scope), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const summary = await summarizeDir(scope, entry.name);
      if (summary) out.push(summary);
    }
  }
  return out.sort((a, b) => a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name));
}

export async function readSkill(scope: SkillScope, name: string, fileName = "SKILL.md") {
  assertSafeName(name);
  if (path.basename(fileName) !== fileName || fileName.includes("..")) {
    throw new Error("非法文件名");
  }
  const dir = skillDir(scope, name);
  const content = await readFile(path.join(dir, fileName), "utf8");
  const files = (await readdir(dir)).filter((item) => item !== ".git");
  return { scope, name, fileName, content, files };
}

export function skillTemplate(name: string, description: string) {
  return `---
name: ${name}
description: ${description}
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
) {
  assertSafeName(name);
  if (path.basename(fileName) !== fileName || fileName.includes("..")) {
    throw new Error("非法文件名");
  }
  await ensureSkillsDirs();
  const dir = skillDir(scope, name);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, fileName);
  await writeFile(file, content, "utf8");
  return { scope, name, fileName, bytes: Buffer.byteLength(content, "utf8") };
}

export async function createSkill(scope: SkillScope, name: string, description: string) {
  assertSafeName(name);
  if (!description.trim()) {
    throw new Error("需要填写 description，方便 Agent 判断何时使用");
  }
  await ensureSkillsDirs();
  const dir = skillDir(scope, name);
  const existing = await readdir(dir).catch(() => null);
  if (existing) {
    throw new Error("同名技能已经存在");
  }
  return writeSkill(scope, name, skillTemplate(name, description.trim()));
}

export async function deleteSkill(scope: SkillScope, name: string) {
  const dir = skillDir(scope, name);
  await rm(dir, { recursive: true, force: false });
  return { ok: true, scope, name };
}
