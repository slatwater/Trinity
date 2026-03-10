# Trinity

Claude Code 本地开发流程可视化客户端。

## 架构

- **前端**: Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + Zustand
- **后端**: Elixir/Phoenix API (port 4000) + ClaudeAgentSDK
- Next.js 通过 `next.config.ts` rewrites 代理 `/api/chat` 和 `/api/session` 到 Elixir 后端
- 每个项目一个持久化 Claude 进程（GenServer），多轮对话共享上下文
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
│   ├── ProjectCard.tsx           # 项目卡片
│   ├── ChatWindow.tsx            # 聊天窗口（SSE 消费端）
│   └── MessageBubble.tsx         # 消息气泡
├── lib/
│   ├── projects.ts               # 项目扫描器
│   └── types.ts                  # 类型定义
└── stores/
    └── chat.ts                   # Zustand 状态 + localStorage 持久化

backend/                          # Elixir/Phoenix 后端
├── lib/trinity/
│   ├── application.ex            # 监督树（Registry + DynamicSupervisor）
│   ├── claude_session.ex         # GenServer：持久化 Claude 进程管理
│   └── stream_event_parser.ex    # SDK 事件 → 前端 JSON 映射
└── lib/trinity_web/
    ├── controllers/
    │   ├── chat_controller.ex    # POST /api/chat → SSE 流式响应
    │   └── session_controller.ex # GET/DELETE /api/session
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
- `--permission-mode bypassPermissions` 无人值守模式
- 启动时通过 `start.sh` 清除 `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT` 避免嵌套检测
