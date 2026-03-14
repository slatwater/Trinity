# Trinity

Claude Code 本地开发流程可视化客户端 + Auto Pilot 全自动开发模式。支持 Electron 桌面应用（macOS）。

## 架构

- **前端**: Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + Zustand
- **后端**: Elixir/Phoenix API (port 4000) + ClaudeAgentSDK
- **桌面**: Electron（hiddenInset 标题栏 + 内嵌 Elixir release + Next.js standalone）
- Next.js rewrites 代理 `/api/*` 到 Elixir；SSE 长连接用 API Route 代理
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
│   ├── evolvelab/page.tsx         # EvolveLab 页（实验/策略详情/错误/数据 多标签）
│   ├── news/page.tsx             # News 页（推特新闻摘要 × 3 分类）
│   ├── project/[id]/page.tsx     # 项目聊天页
│   ├── api/evolvelab/route.ts    # EvolveLab SSE 流式代理
│   ├── api/evolvelab/history/route.ts # 实验历史 CRUD API
│   ├── api/projects/route.ts     # 扫描本地项目
│   └── api/config/route.ts       # 配置读写 API（GET/PUT/POST）
├── components/
│   ├── Sidebar.tsx               # 左侧导航栏（上下分区 + 品牌标记）
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
    ├── chat.ts                   # 聊天状态管理
    └── evolvelab.ts              # EvolveLab 状态管理（SSE + 历史 + 策略详情 + 错误）

backend/
├── lib/trinity/
│   ├── application.ex            # 监督树
│   ├── claude_session.ex         # GenServer：Claude 进程 + 工作流追踪
│   ├── auto_pilot.ex             # GenServer：双 Agent 编排器（状态机）
│   ├── evolve_lab.ex             # GenServer：prompt 进化引擎（策略详情 + 错误收集）
│   ├── news_fetcher.ex           # GenServer：定时推特抓取 + Sonnet 4.6 总结
│   ├── stage_mapper.ex           # 工具名 → 阶段标签
│   └── stream_event_parser.ex    # SDK 事件 → SSE JSON
├── lib/trinity_web/controllers/  # chat / session / auto_pilot / evolve_lab / news
└── scripts/scrape_tweet.py       # Python/Scrapling 推特抓取（Cookie 认证 + Google 翻译）
electron/main.ts + preload.ts     # Electron 主进程 + 预加载
```

## API

| 路由 | 作用 |
|------|------|
| `POST/GET/DELETE /api/autopilot[/:id][/message\|confirm]` | Auto Pilot 全流程 |
| `POST /api/evolvelab` | 启动 prompt 进化实验（SSE 流式，支持 maxConcurrent 参数） |
| `DELETE /api/evolvelab/:id` | 取消实验 |
| `GET/POST/DELETE /api/evolvelab/history` | 实验历史记录（存储 `~/.trinity/evolvelab/`） |
| `GET/POST/PUT /api/news[/*]` | 新闻数据 / 刷新 / 推特账号配置 |

## 关键设计决策

- CSS 变量主题化 `[data-theme="light"]` + localStorage；Sidebar 68px 上下分区布局
- ClaudeAgentSDK：`model: "opus"` + `effort: :high` + `preset: :claude_code` + `bypassPermissions`
- Electron：hiddenInset 标题栏，内嵌 Elixir release + Next.js standalone
- EvolveLab：策略模型(SDK) 建议 prompt → 被测模型(API) 并发评测 200 题（可调 1-50）→ 比较保留最优
- News：Cookie 认证抓推特 → Google 翻译 → Sonnet 4.6 总结，数据存 `~/.trinity/news/`
