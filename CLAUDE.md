# Trinity

Claude Code 本地开发流程可视化客户端 + Auto Pilot 全自动开发模式。支持 Electron 桌面应用（macOS）。

## 架构

- **前端**: Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + Zustand
- **后端**: Elixir/Phoenix API (port 4000) + ClaudeAgentSDK
- **桌面**: Electron（hiddenInset 标题栏 + 内嵌 Elixir release + Next.js standalone）
- Next.js 通过 `next.config.ts` rewrites 代理所有 `/api/*` 到 Elixir 后端
- 每个项目一个持久化 Claude 进程（GenServer），多轮对话共享上下文
- **Auto Pilot**: 双 Agent 编排器，状态机驱动（澄清→规格→测试→合入→编码→CI→修复→发布）

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
│   ├── page.tsx                  # Code 首页（项目仪表盘 + Auto Pilot 入口）
│   ├── config/page.tsx           # Config 页（全局+项目配置树 + 编辑器）
│   ├── news/page.tsx             # News 页（推特新闻摘要 × 3 分类）
│   ├── project/[id]/page.tsx     # 项目聊天页
│   ├── api/projects/route.ts     # 扫描本地项目
│   └── api/config/route.ts       # 配置读写 API（GET/PUT/POST）
├── components/
│   ├── Sidebar.tsx               # 左侧导航栏（Code/Config/News）
│   ├── ConfigEditor.tsx          # 配置文件编辑 Modal
│   ├── ChatWindow.tsx            # 聊天窗口（SSE 流式）
│   ├── ProjectCard.tsx           # 项目卡片（状态徽标）
│   ├── MessageBubble.tsx         # 消息气泡（markdown 渲染）
│   ├── ClaudeMdModal.tsx         # CLAUDE.md 查看弹窗
│   ├── ThemeToggle.tsx           # 深色/浅色主题切换
│   ├── WorkflowMonitor.tsx       # 工作流可视化
│   ├── AutoPilotModal.tsx        # Auto Pilot 启动弹窗
│   └── AutoPilotPanel.tsx        # Auto Pilot 状态面板
├── lib/
│   ├── projects.ts               # 项目扫描器
│   └── types.ts                  # 类型定义
└── stores/
    └── chat.ts                   # Zustand 状态管理

backend/
├── lib/trinity/
│   ├── application.ex            # 监督树
│   ├── claude_session.ex         # GenServer：Claude 进程 + 工作流追踪
│   ├── auto_pilot.ex             # GenServer：双 Agent 编排器（状态机）
│   ├── news_fetcher.ex           # GenServer：定时推特抓取 + Sonnet 4.6 总结
│   ├── stage_mapper.ex           # 工具名 → 阶段标签
│   └── stream_event_parser.ex    # SDK 事件 → SSE JSON
├── lib/trinity_web/controllers/  # chat / session / auto_pilot / news / router
└── scripts/scrape_tweet.py       # Python/Scrapling 推特抓取（Cookie 认证 + Google 翻译）
electron/main.ts + preload.ts     # Electron 主进程 + 预加载
```

## API

| 路由 | 作用 |
|------|------|
| `POST /api/autopilot` | 启动（projectId, projectPath, requirement） |
| `GET /api/autopilot/:id` | 查状态（阶段+双 Agent 工作流+PR 链接） |
| `POST /api/autopilot/:id/message` | 澄清阶段用户回复（SSE 流式） |
| `POST /api/autopilot/:id/confirm` | 确认规格，触发 Agent B 写测试 |
| `DELETE /api/autopilot/:id` | 取消 |
| `GET/POST/PUT /api/news[/*]` | 新闻数据 / 刷新 / 推特账号配置 |

## 关键设计决策

- CSS 变量主题化，`[data-theme="light"]` + localStorage；Sidebar 导航 68px 固定宽度
- ClaudeAgentSDK：`model: "opus"` + `effort: :high` + `preset: :claude_code` + `bypassPermissions`
- SSE 流 PubSub 广播，每次请求唯一 topic；Auto Pilot Task 异步 + CI 轮询自动修复
- Electron：hiddenInset 标题栏，`.drag`/`.no-drag`，内嵌 Elixir release + Next.js standalone
- Config 页：树状展示真实路径，hooks/MCP 提取为独立节点，编辑后合并写回
- News 页：Cookie 认证抓推特 → Google 翻译中文 → Sonnet 4.6 总结，过滤回复/转推/置顶，数据存 `~/.trinity/news/`
