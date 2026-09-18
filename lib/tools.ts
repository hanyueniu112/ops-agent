import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tool } from "ai";
import { z } from "zod";
import {
  listWorkspace,
  readWorkspaceFile,
  resolveWorkspacePath,
  workspaceRoot,
  writeWorkspaceFile,
} from "./workspace";
import { createSkill, deleteSkill, listSkills, readSkill, writeSkill } from "./skills";

const execFileAsync = promisify(execFile);

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string, timeoutMs = 12000) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; WeaveAgent/0.1; +local)",
      Accept: "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`请求失败 ${response.status} ${response.statusText}`);
  }
  return response.text();
}

export function createAgentTools() {
  return {
    list_dir: tool({
      description: "列出工作区目录内容。工作区根目录是 workspace/。",
      inputSchema: z.object({
        path: z.string().optional().describe("相对工作区的目录路径，默认根目录"),
      }),
      execute: async ({ path: dirPath }) => listWorkspace(dirPath || "."),
    }),
    read_file: tool({
      description: "读取工作区中的文本文件。",
      inputSchema: z.object({
        path: z.string().describe("相对工作区的文件路径"),
      }),
      execute: async ({ path: filePath }) => readWorkspaceFile(filePath),
    }),
    write_file: tool({
      description: "向工作区写入文本文件。目录不存在时会自动创建。",
      inputSchema: z.object({
        path: z.string().describe("相对工作区的文件路径"),
        content: z.string().describe("要写入的完整文件内容"),
      }),
      execute: async ({ path: filePath, content }) => writeWorkspaceFile(filePath, content),
    }),
    search_files: tool({
      description: "在工作区文件中搜索文本（不区分大小写）。",
      inputSchema: z.object({
        query: z.string().describe("要搜索的字符串"),
      }),
      execute: async ({ query }) => {
        const { readdir, readFile, stat } = await import("node:fs/promises");
        const path = await import("node:path");
        const root = workspaceRoot();
        const matches: Array<{ path: string; line: number; text: string }> = [];
        const needle = query.toLowerCase();

        async function walk(dir: string) {
          const entries = await readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (matches.length >= 40) return;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              if (entry.name === "node_modules" || entry.name === ".git") continue;
              await walk(full);
              continue;
            }
            const info = await stat(full);
            if (info.size > 400_000) continue;
            const text = await readFile(full, "utf8").catch(() => "");
            const lines = text.split(/\r?\n/);
            lines.forEach((line, index) => {
              if (matches.length >= 40) return;
              if (line.toLowerCase().includes(needle)) {
                matches.push({
                  path: path.relative(root, full).replaceAll("\\", "/"),
                  line: index + 1,
                  text: line.trim().slice(0, 240),
                });
              }
            });
          }
        }

        await walk(root);
        return { query, count: matches.length, matches };
      },
    }),
    run_command: tool({
      description: "在工作区根目录执行一条 shell 命令。适合安装依赖、运行脚本、查看 git 状态。",
      inputSchema: z.object({
        command: z.string().describe("要执行的命令"),
      }),
      execute: async ({ command }) => {
        const cwd = workspaceRoot();
        resolveWorkspacePath(".");
        try {
          const result = await execFileAsync(
            process.env.ComSpec || "cmd.exe",
            ["/d", "/s", "/c", command],
            {
              cwd,
              timeout: 25000,
              maxBuffer: 200_000,
              windowsHide: true,
            },
          );
          return {
            ok: true,
            stdout: String(result.stdout || "").slice(0, 8000),
            stderr: String(result.stderr || "").slice(0, 2000),
          };
        } catch (error) {
          const err = error as {
            stdout?: string;
            stderr?: string;
            message: string;
          };
          return {
            ok: false,
            stdout: String(err.stdout || "").slice(0, 4000),
            stderr: String(err.stderr || err.message).slice(0, 4000),
          };
        }
      },
    }),
    fetch_url: tool({
      description: "抓取一个 URL 的可读文本内容。",
      inputSchema: z.object({
        url: z.string().url().describe("要打开的网址"),
      }),
      execute: async ({ url }) => {
        const raw = await fetchText(url);
        const text = htmlToText(raw).slice(0, 10000);
        return { url, text, truncated: raw.length > 10000 };
      },
    }),
    web_search: tool({
      description: "用关键词做网络检索，返回标题、摘要和链接。",
      inputSchema: z.object({
        query: z.string().describe("搜索关键词"),
      }),
      execute: async ({ query }) => {
        const instantUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const instantRaw = await fetchText(instantUrl).catch(() => "");
        let instant: {
          AbstractText?: string;
          AbstractURL?: string;
          Heading?: string;
          RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
        } = {};
        try {
          instant = instantRaw ? JSON.parse(instantRaw) : {};
        } catch {
          instant = {};
        }

        const results: Array<{ title: string; url?: string; snippet: string }> = [];
        if (instant.AbstractText) {
          results.push({
            title: instant.Heading || query,
            url: instant.AbstractURL,
            snippet: instant.AbstractText,
          });
        }
        for (const topic of instant.RelatedTopics || []) {
          if (topic.Text) {
            results.push({
              title: topic.Text.split(" - ")[0] || topic.Text,
              url: topic.FirstURL,
              snippet: topic.Text,
            });
          }
        }

        if (results.length === 0) {
          const html = await fetchText(
            `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
          );
          const blocks = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
          for (const block of blocks.slice(0, 6)) {
            results.push({
              url: block[1],
              title: htmlToText(block[2]),
              snippet: "",
            });
          }
        }

        return { query, results: results.slice(0, 8) };
      },
    }),
    now: tool({
      description: "获取当前本地日期时间。",
      inputSchema: z.object({
        label: z.string().optional().describe("可选备注，可忽略"),
      }),
      execute: async () => ({
        iso: new Date().toISOString(),
        local: new Date().toLocaleString("zh-CN", { hour12: false }),
      }),
    }),
    list_skills: tool({
      description: "列出可加载的 Agent Skills（项目技能和个人技能）。",
      inputSchema: z.object({
        unused: z.string().optional(),
      }),
      execute: async () => ({ skills: await listSkills() }),
    }),
    read_skill: tool({
      description: "读取一个 Skill 文件，默认 SKILL.md。",
      inputSchema: z.object({
        scope: z.enum(["project", "personal"]).optional(),
        name: z.string().describe("技能目录名"),
        file: z.string().optional().describe("文件名，默认 SKILL.md"),
      }),
      execute: async ({ scope, name, file }) => readSkill(scope || "project", name, file || "SKILL.md"),
    }),
    write_skill: tool({
      description: "创建或覆盖 Skill 文件。SKILL.md 必须带 name 和 description 的 YAML frontmatter。",
      inputSchema: z.object({
        scope: z.enum(["project", "personal"]).optional(),
        name: z.string(),
        content: z.string(),
        file: z.string().optional(),
      }),
      execute: async ({ scope, name, content, file }) =>
        writeSkill(scope || "project", name, content, file || "SKILL.md"),
    }),
    create_skill: tool({
      description: "用模板新建 Skill。",
      inputSchema: z.object({
        scope: z.enum(["project", "personal"]).optional(),
        name: z.string(),
        description: z.string(),
      }),
      execute: async ({ scope, name, description }) => createSkill(scope || "project", name, description),
    }),
    delete_skill: tool({
      description: "删除一个 Skill 目录。",
      inputSchema: z.object({
        scope: z.enum(["project", "personal"]).optional(),
        name: z.string(),
      }),
      execute: async ({ scope, name }) => deleteSkill(scope || "project", name),
    }),
  };
}
