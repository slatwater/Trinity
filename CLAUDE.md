# Trinity

Claude Code 本地开发流程可视化客户端 + Auto Pilot 全自动开发模式。支持 Electron 桌面应用（macOS）。

## 架构

- **前端**: Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + Zustand
- **后端**: Elixir/Phoenix API (port 4000) + ClaudeAgentSDK
- **桌面**: Electron（hiddenInset 标题栏 + 内嵌 Elixir release + Next.js standalone）
- Next.js 通过 `next.config.ts` rewrites 代理所有 `/api/*` 到 Elixir 后端
- 每个项目一个持久化 Claude 进程（GenServer），多轮对话共享上下文
- **Auto Pilot**: 双 Agent 编排器，状态机驱动全自动开发流程（澄清→规格→测试→合入→编码→CI→修复→发布）

## 开发命令

```bash
cd /Users/sevenstars/Projects/Trinity
npm run dev             # Electron 桌面模式（启动前端+后端+窗口）
npm run dev:web         # 纯浏览器模式（start.sh）
npm run deploy          # 一键构建并安装到 /Applications
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
│   ├── ProjectCard.tsx           # 项目卡片（状态徽标 + 迷你开关）
│   ├── MessageBubble.tsx         # 消息气泡（markdown 渲染）
│   ├── ClaudeMdModal.tsx         # CLAUDE.md 查看弹窗
│   ├── ThemeToggle.tsx           # 深色/浅色主题切换开关
│   ├── WorkflowMonitor.tsx       # 工作流可视化（阶段节点 + 箭头）
│   ├── AutoPilotModal.tsx        # Auto Pilot 启动弹窗（选项目+需求）
│   └── AutoPilotPanel.tsx        # Auto Pilot 状态面板（阶段条+聊天+工作流+计时器）
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
electron/
├── main.ts                    # Electron 主进程（进程管理 + 窗口创建）
└── preload.ts                 # 预加载脚本
```

## Auto Pilot API

| 路由 | 作用 |
|------|------|
| `POST /api/autopilot` | 启动（projectId, projectPath, requirement） |
| `GET /api/autopilot/:id` | 查状态（阶段+双 Agent 工作流+PR 链接） |
| `POST /api/autopilot/:id/message` | 澄清阶段用户回复（SSE 流式） |
| `POST /api/autopilot/:id/confirm` | 确认规格，触发 Agent B 写测试 |
| `DELETE /api/autopilot/:id` | 取消 |

## 关键设计决策

- "use client" 组件，CSS 变量主题化，`[data-theme="light"]` 覆盖，localStorage 持久化
- ClaudeAgentSDK：`model: "opus"` + `effort: :high` + `preset: :claude_code` + `bypassPermissions`
- SSE 流通过 PubSub 广播，每次请求唯一 topic 防止事件串线
- Auto Pilot：Task 异步 + wait_for_idle，CI 轮询 + 失败自动修复，通过后合并+打 tag
- Electron：hiddenInset 标题栏，CSS `.drag`/`.no-drag`，Elixir release + Next.js standalone（utilityProcess）内嵌
