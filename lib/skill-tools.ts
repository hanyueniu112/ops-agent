import type { SDKCustomTool } from "@cursor/sdk";
import {
  createSkill,
  deleteSkill,
  listSkills,
  readSkill,
  writeSkill,
  type SkillScope,
} from "@/lib/skills";

function scopeOf(value: unknown): SkillScope {
  return value === "personal" ? "personal" : "project";
}

export function skillCustomTools(): Record<string, SDKCustomTool> {
  return {
    list_skills: {
      description:
        "列出 OPS大脑 可加载的 Agent Skills。项目技能在 workspace/.cursor/skills，个人技能在用户目录 .cursor/skills。",
      inputSchema: { type: "object", properties: { unused: { type: "string" } } },
      annotations: { title: "列出技能", readOnlyHint: true },
      execute: async () => ({ skills: await listSkills() }),
    },
    read_skill: {
      description: "读取一个 Skill 的 SKILL.md 或同目录下的参考文件。",
      inputSchema: {
        type: "object",
        properties: {
          scope: { type: "string", description: "project 或 personal，默认 project" },
          name: { type: "string", description: "技能目录名" },
          file: { type: "string", description: "文件名，默认 SKILL.md" },
        },
        required: ["name"],
      },
      annotations: { title: "读取技能", readOnlyHint: true },
      execute: async (args) =>
        readSkill(scopeOf(args.scope), String(args.name || ""), String(args.file || "SKILL.md")),
    },
    write_skill: {
      description: "创建或覆盖一个 Skill 文件。默认写 SKILL.md，必须包含 YAML frontmatter 的 name 和 description。",
      inputSchema: {
        type: "object",
        properties: {
          scope: { type: "string", description: "project 或 personal，默认 project" },
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
        ),
    },
    create_skill: {
      description: "用模板新建一个 Skill。",
      inputSchema: {
        type: "object",
        properties: {
          scope: { type: "string", description: "project 或 personal，默认 project" },
          name: { type: "string" },
          description: { type: "string", description: "第三人称描述，说明做什么以及何时使用" },
        },
        required: ["name", "description"],
      },
      execute: async (args) =>
        createSkill(scopeOf(args.scope), String(args.name || ""), String(args.description || "")),
    },
    delete_skill: {
      description: "删除一个 Skill 目录。",
      inputSchema: {
        type: "object",
        properties: {
          scope: { type: "string" },
          name: { type: "string" },
        },
        required: ["name"],
      },
      annotations: { title: "删除技能", destructiveHint: true },
      execute: async (args) => deleteSkill(scopeOf(args.scope), String(args.name || "")),
    },
  };
}
