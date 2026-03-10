# Trinity

Claude Code 本地开发流程可视化客户端。

扫描本地工作区的代码项目，提供 Web 聊天界面与 Claude Code CLI 交互，支持多轮上下文对话和无人值守模式。

## 功能

### 项目仪表盘
- 自动扫描本地工作区目录，识别所有代码项目
- 显示项目语言、Git 状态、CLAUDE.md 配置情况
- 按最后修改时间排序，支持关键词筛选
- 卡片式布局，点击进入项目聊天

### 聊天交互
- 在项目上下文中与 Claude 对话（自动以项目目录为工作目录）
- stdout pipe 实时流式输出，无延迟
- 多轮上下文：通过 `--resume` 保持 session 连续性
- 无人值守模式：`--permission-mode bypassPermissions`，Claude 自动执行所有操作
- 聊天记录持久化到 localStorage，刷新页面/退出再进历史保留
- New Chat 按钮：清除前端消息 + 后端 session，开始全新对话

### 支持的项目类型
自动识别：JavaScript/TypeScript, Rust, Go, Python, Elixir, Ruby, Java/Kotlin, C/C++, Dart/Flutter

## 技术架构

```
┌─────────────┐     SSE Stream      ┌──────────────────┐    stdin/stdout    ┌─────────────┐
│   Browser    │ ◄─────────────────► │  Next.js API     │ ◄───────────────► │  Claude CLI  │
│   (React)    │                     │  Routes          │                   │ (--print -)  │
└─────────────┘                     └──────────────────┘                   └─────────────┘
                                           │
                                     项目目录作为 cwd
```

- **前端**: React 19 + Zustand 状态管理（localStorage 持久化） + Tailwind CSS v4
- **后端**: Next.js 15 App Router API Routes
- **CLI 交互**: `claude --print - --output-format stream-json --verbose --permission-mode bypassPermissions`
- **多轮上下文**: `--resume <session_id>` 串联会话
- **通信协议**: Server-Sent Events (SSE)

### 为什么用 `--print -` 而不是 `-p`

Claude CLI 在 stdout 为 pipe（非 TTY）时的行为差异：
- `claude -p "prompt"` — stdout pipe 下进程 hang，无输出
- `claude --print -` — 从 stdin 读 prompt，stdout pipe 正常工作

这是 CLI 的一个行为特性。`--print -` 是程序化调用 Claude CLI 的正确方式。

## 快速开始

### 前置要求
- Node.js 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) 已安装并认证（`claude login`）

### 安装与启动

```bash
git clone https://github.com/slatwater/Trinity.git
cd Trinity
npm install
npm run dev
```

浏览器打开 http://localhost:3000

### 配置工作区

默认扫描 `~/Projects/` 目录。可通过环境变量修改：

```bash
TRINITY_WORKSPACE=/path/to/your/workspace npm run dev
```

## 项目结构

```
src/
├── app/
│   ├── page.tsx                # 首页 - 项目仪表盘
│   ├── project/[id]/page.tsx   # 项目聊天页
│   └── api/
│       ├── projects/route.ts   # 扫描本地项目
│       ├── chat/route.ts       # 聊天 SSE 流
│       └── session/route.ts    # 会话管理（重置）
├── components/
│   ├── ProjectCard.tsx         # 项目卡片
│   ├── ChatWindow.tsx          # 聊天窗口
│   └── MessageBubble.tsx       # 消息气泡
├── lib/
│   ├── claude.ts               # Claude CLI 进程封装
│   ├── projects.ts             # 项目扫描与识别
│   └── types.ts                # TypeScript 类型定义
└── stores/
    └── chat.ts                 # Zustand 状态 + localStorage 持久化
```

## 使用说明

| 操作 | 说明 |
|------|------|
| 点击项目卡片 | 进入项目聊天页 |
| `Enter` | 发送消息 |
| `Shift+Enter` | 输入换行 |
| New Chat 按钮 | 重置上下文，开始新会话 |

## Changelog

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
