# Trinity

Claude Code 本地开发流程可视化客户端。

扫描本地工作区的代码项目，提供 Web 聊天界面与 Claude Code 交互，支持持久化进程和多轮上下文对话。

## 功能

### 项目仪表盘
- 自动扫描本地工作区目录，识别所有代码项目
- 显示项目语言、Git 状态、CLAUDE.md 配置情况
- 按最后修改时间排序，支持关键词筛选
- 卡片式布局，点击进入项目聊天

### 聊天交互
- 每个项目一个持久化 Claude 进程，多轮对话共享完整上下文
- SSE 实时流式输出，无延迟
- 进程状态实时指示（绿色圆点 = 进程运行中）
- 无人值守模式：`bypassPermissions`，Claude 自动执行所有操作
- 聊天记录持久化到 localStorage，刷新页面历史保留
- New Chat 按钮：终止当前进程 + 清除前端消息，开始全新会话

### 支持的项目类型
自动识别：JavaScript/TypeScript, Rust, Go, Python, Elixir, Ruby, Java/Kotlin, C/C++, Dart/Flutter

## 技术架构

```
┌─────────────┐     SSE Stream      ┌──────────────────┐    rewrites     ┌──────────────────┐   ClaudeAgentSDK   ┌─────────────┐
│   Browser    │ ◄─────────────────► │  Next.js          │ ◄────────────► │  Phoenix API      │ ◄───────────────► │  Claude CLI  │
│   (React)    │                     │  (port 3000)      │                │  (port 4000)      │                   │ (persistent) │
└─────────────┘                     └──────────────────┘                └──────────────────┘                   └─────────────┘
                                           │                                    │
                                     /api/projects                    GenServer per project
                                     (唯一 Node API)                  (DynamicSupervisor + Registry)
```

- **前端**: Next.js 15 + React 19 + Zustand + Tailwind CSS v4
- **后端**: Elixir/Phoenix API + ClaudeAgentSDK（持久化进程管理）
- **代理**: Next.js rewrites 将 `/api/chat` `/api/session` 转发到 Phoenix
- **进程模型**: 每个项目一个 GenServer，内部维护一个持久化 Claude CLI 子进程
- **通信协议**: Server-Sent Events (SSE)，通过 Phoenix.PubSub 广播

### 为什么用 Elixir 后端

v1.x 使用 Node.js 直接 spawn Claude CLI，每条消息启动新进程，通过 `--resume` 恢复上下文。
这种方式有明显缺陷：每次都要冷启动 Claude 进程，上下文恢复有延迟。

v2.0 引入 Elixir 后端，使用 ClaudeAgentSDK 维护持久化 Claude 进程：
- 首次发消息时启动进程，后续消息复用同一进程
- GenServer + DynamicSupervisor 管理进程生命周期
- 进程崩溃自动清理，New Chat 主动终止

## 快速开始

### 前置要求
- Node.js 18+
- Elixir 1.17+ / OTP 27+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) 已安装并认证（`claude login`）

### 安装与启动

```bash
git clone https://github.com/slatwater/Trinity.git
cd Trinity

# 安装前端依赖
npm install

# 安装后端依赖
cd backend && mix deps.get && cd ..

# 一键启动（前端 + 后端）
./start.sh
```

浏览器打开 http://localhost:3000

### 分别启动

```bash
# 终端 1：Elixir 后端
cd backend && mix phx.server

# 终端 2：Next.js 前端
npm run dev
```

### 配置工作区

默认扫描 `~/Projects/` 目录。可通过环境变量修改：

```bash
TRINITY_WORKSPACE=/path/to/your/workspace ./start.sh
```

## 项目结构

```
src/                              # Next.js 前端
├── app/
│   ├── page.tsx                  # 首页 - 项目仪表盘
│   ├── project/[id]/page.tsx     # 项目聊天页（含进程状态指示器）
│   └── api/projects/route.ts     # 扫描本地项目
├── components/
│   ├── ProjectCard.tsx           # 项目卡片
│   ├── ChatWindow.tsx            # 聊天窗口（SSE 消费端）
│   └── MessageBubble.tsx         # 消息气泡
├── lib/
│   ├── projects.ts               # 项目扫描与识别
│   └── types.ts                  # TypeScript 类型定义
└── stores/
    └── chat.ts                   # Zustand 状态 + localStorage 持久化

backend/                          # Elixir/Phoenix 后端
├── lib/trinity/
│   ├── application.ex            # 监督树
│   ├── claude_session.ex         # GenServer：持久化 Claude 进程
│   └── stream_event_parser.ex    # SDK 事件 → 前端 JSON 映射
└── lib/trinity_web/
    ├── controllers/
    │   ├── chat_controller.ex    # POST /api/chat → SSE 流式响应
    │   └── session_controller.ex # GET/DELETE /api/session
    └── router.ex                 # API 路由
```

## 使用说明

| 操作 | 说明 |
|------|------|
| 点击项目卡片 | 进入项目聊天页 |
| `Enter` | 发送消息 |
| `Shift+Enter` | 输入换行 |
| New Chat 按钮 | 终止进程，重置上下文，开始新会话 |
| 绿色圆点 | Claude 进程运行中（灰色 = 无活跃进程） |

## Changelog

### v2.0
- **架构升级**：引入 Elixir/Phoenix 后端，替代 Node.js 直接管理 Claude 进程
- **持久化进程**：每个项目一个长驻 Claude 进程，多轮对话无需重启，共享完整上下文
- **进程生命周期管理**：GenServer + DynamicSupervisor + Registry，自动清理崩溃进程
- **进程状态指示器**：实时显示 Claude 进程是否运行（绿色/灰色圆点）
- **ClaudeAgentSDK 集成**：通过 Elixir SDK 管理 Claude CLI 子进程的启动、通信和关闭
- **前后端分离**：Next.js 仅负责前端 + 项目扫描，聊天逻辑完全由 Elixir 处理

### v1.1
- **重构 CLI 交互**：从 `-p` + 文件轮询改为 `--print -` + stdout pipe，实时流式输出
- **多轮上下文**：通过 `--resume` 保持同一项目内的会话连续性
- **无人值守**：添加 `--permission-mode bypassPermissions`，Claude 自动执行操作无需确认
- **聊天记录持久化**：localStorage 存储，刷新/退出不丢失
- **精简界面**：去掉独立 Task 模式，统一为聊天交互 + New Chat 重置

### v1.0
- 初始版本：项目仪表盘、聊天窗口、后台任务面板

## License

MIT
