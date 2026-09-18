import type { SDKCustomTool } from "@cursor/sdk";
import {
  createGroup,
  createSkill,
  deleteGroup,
  deleteSkill,
  listSkills,
  readGroups,
  readSkill,
  writeSkill,
  type SkillScope,
} from "@/lib/skills";

function scopeOf(value: unknown): SkillScope {
  return value === "personal" ? "personal" : "project";
}

function groupOf(value: unknown) {
  return String(value || "general");
}

export function skillCustomTools(): Record<string, SDKCustomTool> {
  return {
    list_skills: {
      description:
        "列出 OPS大脑 可加载的 Agent Skills，按分组（通用 / 告警分析 / 请求调用 / 日志流 等）。项目技能在 workspace/.cursor/skills/{分组}/{名称}。",
      inputSchema: { type: "object", properties: { unused: { type: "string" } } },
      annotations: { title: "列出技能", readOnlyHint: true },
      execute: async () => ({
        skills: await listSkills(),
        groups: {
          project: await readGroups("project"),
          personal: await readGroups("personal"),
        },
      }),
    },
    read_skill: {
      description: "读取一个 Skill 的 SKILL.md 或同目录下的参考文件。",
      inputSchema: {
        type: "object",
        properties: {
          scope: { type: "string", description: "project 或 personal，默认 project" },
          group: { type: "string", description: "分组 id，默认 general" },
          name: { type: "string", description: "技能目录名" },
          file: { type: "string", description: "文件名，默认 SKILL.md" },
        },
        required: ["name"],
      },
      annotations: { title: "读取技能", readOnlyHint: true },
      execute: async (args) =>
        readSkill(
          scopeOf(args.scope),
          String(args.name || ""),
          String(args.file || "SKILL.md"),
          groupOf(args.group),
        ),
    },
    write_skill: {
      description: "创建或覆盖一个 Skill 文件。默认写 SKILL.md，必须包含 YAML frontmatter 的 name、description、group。",
      inputSchema: {
        type: "object",
        properties: {
          scope: { type: "string", description: "project 或 personal，默认 project" },
          group: { type: "string", description: "分组 id，默认 general" },
          name: { type: "string", description: "技能目录名，小写字母数字和连字符" },
          content: { type: "string", description: "完整文件内容" },
          file: { type: "string", description: "文件名，默认 SKILL.md" },
        },
        required: ["name", "content"],
      },
      annotations: { title: "写入技能", destructiveHint: true },
      execute: async (args) =>
        writeSkill(
          scopeOf(args.scope),
          String(args.name || ""),
          String(args.content || ""),
          String(args.file || "SKILL.md"),
          groupOf(args.group),
        ),
    },
    create_skill: {
      description: "用模板在指定分组新建一个 Skill。分组例如 general、alert-analysis、request-call、log-stream。",
      inputSchema: {
        type: "object",
        properties: {
          scope: { type: "string", description: "project 或 personal，默认 project" },
          group: { type: "string", description: "分组 id，默认 general" },
          name: { type: "string" },
          description: { type: "string", description: "第三人称描述，说明做什么以及何时使用" },
        },
        required: ["name", "description"],
      },
      execute: async (args) =>
        createSkill(
          scopeOf(args.scope),
          String(args.name || ""),
          String(args.description || ""),
          groupOf(args.group),
        ),
    },
    delete_skill: {
      description: "删除一个 Skill 目录。",
      inputSchema: {
        type: "object",
        properties: {
          scope: { type: "string" },
          group: { type: "string", description: "分组 id，默认 general" },
          name: { type: "string" },
        },
        required: ["name"],
      },
      annotations: { title: "删除技能", destructiveHint: true },
      execute: async (args) =>
        deleteSkill(scopeOf(args.scope), String(args.name || ""), groupOf(args.group)),
    },
    create_skill_group: {
      description: "新建技能分组。内置分组：general、alert-analysis、request-call、log-stream。",
      inputSchema: {
        type: "object",
        properties: {
          scope: { type: "string" },
          id: { type: "string", description: "分组 id，小写字母数字和连字符" },
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["id", "title"],
      },
      execute: async (args) =>
        createGroup(scopeOf(args.scope), {
          id: String(args.id || ""),
          title: String(args.title || ""),
          description: String(args.description || ""),
        }),
    },
    delete_skill_group: {
      description: "删除空的自定义技能分组。内置分组不能删。",
      inputSchema: {
        type: "object",
        properties: {
          scope: { type: "string" },
          id: { type: "string" },
        },
        required: ["id"],
      },
      annotations: { title: "删除技能分组", destructiveHint: true },
      execute: async (args) => deleteGroup(scopeOf(args.scope), String(args.id || "")),
    },
  };
}
