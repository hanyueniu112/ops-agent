# 北向 API

OPS大脑作为服务跑起来之后，其它系统（尤其是后续的 **AIOps 平台**）用 **HTTP JSON** 调它：发对话、查技能、查对话结果。

基址默认 `http://localhost:3000`。

## 身份

北向业务接口**不用传 Token、也不用传模型密钥**。一律使用系统账号 **`aiops`**，模型走 OPS大脑服务端已经配好的 `CURSOR_API_KEY` / `OPENAI_API_KEY`。

- `aiops` 启动时自动创建，网页不能注册、不能登录这个名字
- 默认把对话建成**公共会话**，OPS大脑侧栏里能看见，创建者显示为 `aiops`
- 网页人工账号仍然走登录 Cookie，互不影响

```bash
curl -s http://localhost:3000/api/v1/me
```

应返回 `"username": "aiops"`。

## 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/health` | 健康检查 |
| GET | `/api/v1/me` | 当前北向身份 |
| GET | `/api/v1` | 接口目录 |
| POST | `/api/v1/chat` | 发一条消息 |
| GET | `/api/v1/chats` | 列出会话 |
| POST | `/api/v1/chats` | 只建空会话，不跑模型 |
| GET | `/api/v1/chats/{id}` | 会话 + 全部消息 |
| GET | `/api/v1/chats/{id}/result` | 最近一轮结果 |
| GET | `/api/v1/jobs/{id}` | 某次 chat 任务状态 |
| GET | `/api/v1/skills` | 技能列表，可用 `?group=` `?scope=` |
| GET | `/api/v1/skills/{group}/{name}` | 读 SKILL.md |

## 发消息

`wait` 默认 `true`：等到这一轮结束再返回（最长约 5 分钟）。不能阻塞时设 `wait: false`，立刻 `202`，再用 `job.id` 或 `chat.id` 去查。

```bash
curl -s http://localhost:3000/api/v1/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"message\":\"列出当前告警分析类技能\",\"wait\":true}"
```

请求体：

```json
{
  "message": "把这条告警做归并和根因初判",
  "sessionId": "可选，不传就新建会话",
  "visibility": "public",
  "title": "可选标题",
  "wait": true
}
```

`wait: true` 时关注：

- `result.text`：助手正文
- `result.tools`：这一轮工具调用
- `chat.id`：以后继续聊把这个当 `sessionId`
- `job.status`：`done` / `error`
- `chat.ownerName`：固定为 `aiops`

`wait: false` 时轮询：

```bash
curl -s http://localhost:3000/api/v1/jobs/<jobId>
curl -s http://localhost:3000/api/v1/chats/<sessionId>/result
```

同一会话多人同时提问时，以最后一条为准，进行中的回答会被覆盖。

## 查技能

```bash
curl -s http://localhost:3000/api/v1/skills
curl -s "http://localhost:3000/api/v1/skills?group=alert-analysis"
curl -s http://localhost:3000/api/v1/skills/alert-analysis/alert-triage
```

## 查对话结果

```bash
curl -s http://localhost:3000/api/v1/chats
curl -s http://localhost:3000/api/v1/chats/<sessionId>
curl -s http://localhost:3000/api/v1/chats/<sessionId>/result
```

`/result` 只给最近一轮：`status`、`result.text`、`result.tools`。整段历史在 `GET /api/v1/chats/{id}` 的 `chat.messages`。

## 健康检查

```bash
curl -s http://localhost:3000/api/v1/health
```

返回里带 `aiops.username`。模型是否可用看 `model.provider`（`cursor` 或 `openai-compatible`）。
