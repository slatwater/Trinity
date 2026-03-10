# Trinity

Claude Code 本地开发流程可视化客户端。

## 架构

- **前端**: Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + Zustand
- **后端**: Elixir/Phoenix API (port 4000) + ClaudeAgentSDK
- Next.js 通过 `next.config.ts` rewrites 代理 `/api/chat`、`/api/session`、`/api/messages`、`/api/workflows` 到 Elixir 后端
- 每个项目一个持久化 Claude 进程（GenServer），多轮对话共享上下文
- GenServer 实时累积响应文本，退出页面不丢失对话内容
- 点击 "New Chat" 才会终止进程并重建

## 开发命令

```bash
# 前端
cd /Users/sevenstars/Projects/trinity
npm run dev          # localhost:3000

# 后端
cd backend
mix deps.get
mix phx.server       # localhost:4000

# 或用 start.sh 同时启动两者
```

## 工程索引

```
src/                              # Next.js 前端
├── app/
│   ├── page.tsx                  # 首页 - 项目仪表盘
│   ├── project/[id]/page.tsx     # 项目聊天页（含进程状态指示器）
│   └── api/projects/route.ts     # 扫描本地项目（唯一保留的 Node API）
├── components/
│   ├── ProjectCard.tsx           # 项目卡片（含 running/idle 状态徽标）
│   ├── ChatWindow.tsx            # 聊天窗口（SSE + 后端轮询 + 工具活动指示器）
│   ├── MessageBubble.tsx         # 消息气泡
│   └── WorkflowMonitor.tsx       # 工作流可视化（水平阶段节点 + 箭头）
├── lib/
│   ├── projects.ts               # 项目扫描器
│   └── types.ts                  # 类型定义
└── stores/
    └── chat.ts                   # Zustand 状态管理

backend/                          # Elixir/Phoenix 后端
├── lib/trinity/
│   ├── application.ex            # 监督树（Registry + DynamicSupervisor）
│   ├── claude_session.ex         # GenServer：持久化 Claude 进程管理 + 工作流阶段追踪
│   ├── stage_mapper.ex           # 工具名 → 可读阶段标签映射
│   └── stream_event_parser.ex    # SDK 事件 → 前端 JSON 映射
└── lib/trinity_web/
    ├── controllers/
    │   ├── chat_controller.ex    # POST /api/chat → SSE 流式响应
    │   └── session_controller.ex # GET/DELETE /api/session + GET /api/messages + GET /api/workflows
    └── router.ex                 # API 路由
```

## 环境变量

- `TRINITY_WORKSPACE`: 工作区根目录，默认 `~/Projects/`

## 代码规范

- 前端组件用 "use client" 标记
- CSS 变量定义在 globals.css，不用 Tailwind 颜色
- Elixir 后端纯 API，无 HTML/LiveView

## 关键设计决策

- Claude 进程通过 Elixir ClaudeAgentSDK 管理（`Streaming.start_session/send_message/close_session`）
- SSE 流通过 Phoenix.PubSub 广播 → ChatController chunked response 消费
- GenServer 实时累积文本（`{:accumulate_text, text}`），断连不丢数据
- 前端通过 `GET /api/messages` 轮询后端，自动恢复断连期间的完整响应
- ChatController 自动重启崩溃的 GenServer（`safe_send_message`）
- `system_prompt: %{type: :preset, preset: :claude_code}` 保留 Claude Code 默认行为
- `--permission-mode bypassPermissions` 无人值守模式
- 启动时通过 `start.sh` 清除 `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT` 避免嵌套检测
- 仪表盘每 5 秒轮询各项目状态，显示 running/idle 徽标
- 聊天窗口实时显示工具活动指示器（Read/Edit/Bash 等），不污染消息内容
- 工作流可视化：GenServer 追踪阶段事件，去重折叠，`/api/workflows` 批量查询
- 默认使用 `model: "opus"` + `effort: :high`，与本地 Claude Code 行为一致
