import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { LiveDots } from "@/components/think-block";

const LABELS: Record<string, string> = {
  list_dir: "列出目录",
  read_file: "读取文件",
  write_file: "写入文件",
  search_files: "搜索文件",
  run_command: "运行命令",
  fetch_url: "打开网页",
  web_search: "网络检索",
  now: "当前时间",
  shell: "运行命令",
  read: "读取文件",
  write: "写入文件",
  edit: "编辑文件",
  grep: "搜索文件",
  glob: "匹配文件",
  ls: "列出目录",
  mcp: "MCP",
  delete: "删除文件",
  webSearch: "网络检索",
  webFetch: "打开网页",
  semSearch: "语义搜索",
  updateTodos: "更新待办",
  readLints: "读取诊断",
  list_skills: "列出技能",
  read_skill: "读取技能",
  write_skill: "写入技能",
  create_skill: "新建技能",
  delete_skill: "删除技能",
  create_skill_group: "新建技能分组",
  delete_skill_group: "删除技能分组",
  read_memory: "读取长期记忆",
  read_dreams: "读取梦境日记",
  run_dream: "立刻整理记忆",
};

function toolLabel(name: string) {
  return LABELS[name] || name;
}

function summarize(part: {
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}) {
  if (part.state === "output-error") return part.errorText || "失败";
  const input = (part.input || {}) as Record<string, unknown>;
  const output = part.output as Record<string, unknown> | undefined;
  if (typeof input.path === "string") return input.path;
  if (typeof input.query === "string") return input.query;
  if (typeof input.pattern === "string") return input.pattern;
  if (typeof input.glob === "string") return input.glob;
  if (typeof input.url === "string") return input.url;
  if (typeof input.command === "string") return input.command;
  if (output && typeof output.local === "string") return output.local;
  return "";
}

function isSettled(state: string) {
  return state === "output-available" || state === "output-error";
}

export function ToolFold({
  parts,
  id,
  live = false,
}: {
  parts: UIMessage["parts"];
  id: string;
  live?: boolean;
}) {
  const tools = parts.filter(isToolUIPart);
  if (tools.length === 0) return null;
  const running = live && tools.some((part) => !isSettled(part.state));
  const failed = tools.some((part) => part.state === "output-error");
  const current = [...tools].reverse().find((part) => !isSettled(part.state)) || tools.at(-1);
  const currentLabel = current ? toolLabel(getToolName(current)) : "";
  const currentDetail = current ? summarize(current) : "";

  return (
    <details className={`fold-block ${running ? "is-live" : ""} ${failed ? "is-failed" : ""}`}>
      <summary>
        <span>工具</span>
        <span className="fold-count" key={tools.length}>
          {tools.length} 项
        </span>
        {running ? <LiveDots /> : null}
        {running ? (
          <span className="live-snippet">
            {currentLabel}
            {currentDetail ? ` · ${currentDetail}` : ""}
          </span>
        ) : null}
      </summary>
      <div className="tool-fold-body">
        {tools.map((part, index) => (
          <ToolCard key={`${id}-${index}`} part={part} />
        ))}
      </div>
    </details>
  );
}

export function ToolCard({ part }: { part: UIMessage["parts"][number] }) {
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part);
  const label = toolLabel(name);
  const done = part.state === "output-available";
  const failed = part.state === "output-error";
  const pending = !done && !failed;
  const detail = summarize(part);

  return (
    <div
      className={`tool-card ${done ? "is-done" : ""} ${failed ? "is-failed" : ""} ${pending ? "is-pending" : ""}`}
    >
      <span className="tool-dot" />
      <div className="min-w-0">
        <div className="tool-name">{label}</div>
        {detail ? <div className="tool-detail">{detail}</div> : null}
      </div>
    </div>
  );
}
