# OPS大脑

**OPS Agent**。目标是做成一套可落地的通用化运维智能体：不只聊天，能在工作区里读文件、改文件、跑命令、管技能、查网页，把运维与事务真正做完。

当前产品名是 **OPS大脑**。界面走纯白、会话按 URL 隔离，Agent 在后台继续工作。

更完整的功能清单见 [doc/当前功能.md](doc/当前功能.md)。

## 定位

运维场景里大量工作是重复的：看目录、翻日志、改配置、写脚本、查文档、按规范落技能。OPS大脑把这些收进同一个 Agent：

- **通用**：不绑死某一套监控或工单系统，先提供文件、命令、检索、技能这些底座能力
- **本机优先**：默认跑在你自己的电脑上，工作区就在项目里的 `workspace/`
- **可扩展**：用 Agent Skill（`SKILL.md`）把团队规范、排障手册、发布清单变成可加载的能力

后续会沿这条线补更多 OPS 场景（巡检、变更、排障、知识沉淀），而不是做成又一个聊天框。

## 快速开始

需要 Node.js 20+（本仓库开发时使用 Node 24）。

```bash
npm install
copy .env.example .env.local
```

在 `.env.local` 里填入 `CURSOR_API_KEY`（使用 Cursor 当前账号时）。然后：

```bash
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。根路径会自动进入一个会话地址 `/s/{sessionId}`。

也可以在页面右上角「设置」里改用 DeepSeek、OpenAI、Kimi 或任意 OpenAI 兼容接口。

## 你会用到的东西

| 能力 | 说明 |
| --- | --- |
| 会话 | 每个对话一条 URL，支持跳转、复制 session id，切走后后台仍在跑 |
| 工作区 | Agent 读写、搜索、执行命令都落在 `workspace/` |
| 技能 | 项目技能在 `workspace/.cursor/skills`，个人技能在用户目录 `.cursor/skills` |
| 模型 | 默认 Cursor 本机 Agent；也可接外部 API |
| 正文 | Markdown 渲染；Think / 工具调用默认折叠；每轮正文可导出 `.md` |

## 技术栈

- Next.js 16（App Router）
- AI SDK 7 + Cursor SDK（`@cursor/sdk`）
- Tailwind CSS 4
- 会话与设置存在浏览器 `localStorage`（本机使用，不经过额外后端账号体系）

## 安全注意

- 不要把 `.env.local`、API Key、`.weave-agents.json` 提交进 Git
- `run_command` 会在工作区执行本机命令，只建议在受控环境使用
- Agent 以你的身份访问 Cursor 工具与 MCP，只加载可信技能与 MCP 源

## 许可证

未指定开源许可证。代码默认仅供本仓库协作者使用。
