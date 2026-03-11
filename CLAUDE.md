# Trinity

Claude Code 本地开发流程可视化客户端 + Auto Pilot 全自动开发模式。

## 架构

- **前端**: Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + Zustand
- **后端**: Elixir/Phoenix API (port 4000) + ClaudeAgentSDK
- Next.js 通过 `next.config.ts` rewrites 代理所有 `/api/*` 到 Elixir 后端
- 每个项目一个持久化 Claude 进程（GenServer），多轮对话共享上下文
- **Auto Pilot**: 双 Agent 编排器，状态机驱动全自动开发流程（澄清→规格→测试→合入→编码→CI→修复→发布）

## 开发命令

```bash
cd /Users/sevenstars/Projects/trinity
./start.sh              # 同时启动前端(:3000) + 后端(:4000)
# 或分别启动：npm run dev / cd backend && mix phx.server
```

## 工程索引

```
src/
├── app/
│   ├── page.tsx                  # 首页（项目仪表盘 + Auto Pilot 入口）
│   ├── project/[id]/page.tsx     # 项目聊天页
│   └── api/projects/route.ts     # 扫描本地项目（唯一 Node API）
├── components/
│   ├── ChatWindow.tsx            # 聊天窗口（SSE 流式）
│   ├── ProjectCard.tsx           # 项目卡片（状态徽标）
│   ├── MessageBubble.tsx         # 消息气泡
│   ├── WorkflowMonitor.tsx       # 工作流可视化（阶段节点 + 箭头）
│   ├── AutoPilotModal.tsx        # Auto Pilot 启动弹窗（选项目+需求）
│   └── AutoPilotPanel.tsx        # Auto Pilot 状态面板（阶段条+聊天+工作流）
├── lib/
│   ├── projects.ts               # 项目扫描器
│   └── types.ts                  # 类型定义
└── stores/
    └── chat.ts                   # Zustand 状态管理

backend/
├── lib/trinity/
│   ├── application.ex            # 监督树（Session/AutoPilot Registry + DynamicSupervisor）
│   ├── claude_session.ex         # GenServer：Claude 进程管理 + 工作流追踪
│   ├── auto_pilot.ex             # GenServer：双 Agent 编排器（状态机）
│   ├── stage_mapper.ex           # 工具名 → 阶段标签
│   └── stream_event_parser.ex    # SDK 事件 → SSE JSON
└── lib/trinity_web/controllers/
    ├── chat_controller.ex        # POST /api/chat → SSE
    ├── session_controller.ex     # 会话/消息/工作流查询
    ├── auto_pilot_controller.ex  # Auto Pilot 5 个 API 端点
    └── router.ex                 # 路由
```

## Auto Pilot API

| 路由 | 作用 |
|------|------|
| `POST /api/autopilot` | 启动（projectId, projectPath, requirement） |
| `GET /api/autopilot/:id` | 查状态（阶段+双 Agent 工作流+PR 链接） |
| `POST /api/autopilot/:id/message` | 澄清阶段用户回复（SSE 流式） |
| `POST /api/autopilot/:id/confirm` | 确认规格，触发 Agent B 写测试 |
| `DELETE /api/autopilot/:id` | 取消 |

## 代码规范

- 前端组件用 "use client"，CSS 变量在 globals.css，`TRINITY_WORKSPACE` 默认 `~/Projects/`

## 关键设计决策

- ClaudeAgentSDK：`model: "opus"` + `effort: :high` + `preset: :claude_code` + `bypassPermissions`
- SSE 流通过 PubSub 广播，每次请求唯一 topic 防止事件串线
- Auto Pilot 编排：Task 异步调用 ClaudeSession + wait_for_idle 轮询完成
- CI 监控：`gh pr checks --json state` 轮询，失败日志直传 Agent A 修复
- CI 通过后自动合并 PR + 打语义化版本 tag
- Agent B 只修改已有测试文件，不新建，防止测试文件膨胀
- 澄清阶段 prompt 强约束：禁止工具调用，仅允许提问
