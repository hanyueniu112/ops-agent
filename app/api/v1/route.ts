import { jsonApi, optionsApi } from "@/lib/api-http";

export const runtime = "nodejs";

export function OPTIONS() {
  return optionsApi();
}

export async function GET() {
  return jsonApi({
    name: "OPS大脑 北向 API",
    version: "v1",
    account: "aiops",
    auth: "业务接口不用传 Token，固定以系统账号 aiops 调用；模型鉴权用 OPS大脑服务端已配置的 CURSOR_API_KEY / OPENAI_API_KEY",
    endpoints: [
      { method: "GET", path: "/api/v1/health", desc: "健康检查" },
      { method: "GET", path: "/api/v1/me", desc: "当前北向身份（aiops）" },
      { method: "POST", path: "/api/v1/chat", desc: "发消息；wait=true 等结果，false 则 202 后去查" },
      { method: "GET", path: "/api/v1/chats", desc: "列出会话" },
      { method: "GET", path: "/api/v1/chats/{id}", desc: "查询会话与全部消息" },
      { method: "GET", path: "/api/v1/chats/{id}/result", desc: "查询最近一轮对话结果" },
      { method: "GET", path: "/api/v1/jobs/{id}", desc: "查询一次 chat 任务状态" },
      { method: "GET", path: "/api/v1/skills", desc: "列出技能与分组" },
      { method: "GET", path: "/api/v1/skills/{group}/{name}", desc: "读取一个技能" },
    ],
  });
}
