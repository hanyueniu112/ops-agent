# OPS大脑

**OPS Agent**。目标是做成一套可落地的通用化运维智能体：不只聊天，能在工作区里读文件、改文件、跑命令、管技能、查网页，把运维与事务真正做完。

当前产品名是 **OPS大脑**。界面走纯白、会话按 URL 隔离，Agent 在后台继续工作。

更完整的功能清单见 [doc/当前功能.md](doc/当前功能.md)。

## 定位

运维场景里大量工作是重复的：看目录、翻日志、改配置、写脚本、查文档、按规范落技能。OPS大脑把这些收进同一个 Agent：

- **通用**：不绑死某一套监控或工单系统，先提供文件、命令、检索、技能这些底座能力
- **可扩展**：用 Agent Skill（`SKILL.md`）把团队规范、排障手册、发布清单按分组变成可加载的能力；Dream 把公共会话沉淀成长期记忆

后续会沿这条线补更多 OPS 场景（巡检、变更、排障、知识沉淀），而不是做成又一个聊天框。

## 未来主推功能：
1.告警处理Dream自学习机制，一键快速分析告警，并给出处理建议。
2.故障全链路快速根因定位，只需要配置链路skill及相关mcp，全自动探索链路路径，产生Maas网络地图，请求卡在哪一眼明了。
3.智能巡检，根据诉求生成固定巡检任务，并可选择是否进一步AI分析。（比如巡检发现某个时间段请求TTFT时延飙高，自动帮你分析，如有需要可打通告警平台自动产生告警，后续对接告警自处理机制，无人值守！！！）
4.日志RCA快速定界。
5.这只是Agent，加上AIOPS可视化平台和AI大数据处理平台才是完整的AIOPS系统。

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

浏览器打开 [http://localhost:3000](http://localhost:3000)，先注册/登录。根路径会进入一个会话地址 `/s/{sessionId}`。

会话存在项目根目录的 `data/ops.sqlite`（可用环境变量 `OPS_DATA_DIR` 改路径）。这个文件不在 `.next` 里，`npm run dev` 重启、重新 `next build` 都不会删掉。

也可以在页面右上角「设置」里改用 DeepSeek、OpenAI、Kimi 或任意 OpenAI 兼容接口。

## 你会用到的东西

| 能力 | 说明 |
| --- | --- |
| 登录 | 平台账号，登录后才能看会话 |
| 会话 | 每个对话一条 URL；**公共会话**所有登录用户可见，**个人会话**仅自己可见 |
| 持久化 | SQLite（`data/ops.sqlite`），换浏览器、重启项目都还在 |
| 工作区 | Agent 读写、搜索、执行命令都落在 `workspace/` |
| 技能 | 按分组放在 `workspace/.cursor/skills/{分组}/{名称}`；内置分组：通用、告警分析、请求调用、日志流 |
| Dream | 浅睡 / REM / 深睡整理**公共会话**到 `workspace/.ops/MEMORY.md`；个人会话不进入记忆 |
| 模型 | 默认 Cursor 本机 Agent；也可接外部 API |
| 正文 | Markdown 渲染；Think / 工具调用默认折叠；每轮正文可导出 `.md` |

## 技术栈

- Next.js 16（App Router）
- AI SDK 7 + Cursor SDK（`@cursor/sdk`）
- Tailwind CSS 4
- 用户与会话存在 SQLite（Node 内置 `node:sqlite`）
- 模型设置仍存在浏览器 `localStorage`

## 安全注意

- 不要把 `.env.local`、API Key、`.weave-agents.json` 提交进 Git
- `run_command` 会在工作区执行本机命令，只建议在受控环境使用
- Agent 以你的身份访问 Cursor 工具与 MCP，只加载可信技能与 MCP 源

## 许可证

未指定开源许可证。代码默认仅供本仓库协作者使用。
