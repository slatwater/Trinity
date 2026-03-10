# Trinity

Claude Code 本地开发流程可视化客户端。

扫描本地工作区的代码项目，提供 Web 聊天界面与 Claude Code CLI 交互，支持即时对话和后台无人值守任务执行。

## 功能

### 项目仪表盘
- 自动扫描本地工作区目录，识别所有代码项目
- 显示项目语言、Git 状态、CLAUDE.md 配置情况
- 按最后修改时间排序，支持关键词筛选
- 卡片式布局，点击进入项目聊天

### 即时聊天
- 在项目上下文中与 Claude 对话（自动以项目目录为工作目录）
- SSE 流式输出，实时显示 Claude 回复
- 支持多项目会话切换，各项目聊天记录独立

### 后台任务（无人值守模式）
- `⌘+Enter` 将指令下发为后台任务
- Agent 独立执行，不阻塞聊天窗口
- 任务面板实时显示运行状态（Running / Done / Failed）
- 展开查看完整执行结果

## 技术架构

```
┌─────────────┐     SSE Stream      ┌──────────────────┐     spawn      ┌─────────────┐
│   Browser    │ ◄─────────────────► │  Next.js API     │ ◄───────────► │  Claude CLI  │
│   (React)    │                     │  Routes          │               │  (claude -p) │
└─────────────┘                     └──────────────────┘               └─────────────┘
                                           │
                                     项目目录作为 cwd
```

- **前端**: React 19 + Zustand 状态管理 + Tailwind CSS v4
- **后端**: Next.js 15 App Router API Routes
- **CLI 交互**: `claude -p --output-format stream-json` 流式 JSON 输出
- **通信协议**: Server-Sent Events (SSE)

## 快速开始

### 前置要求
- Node.js 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) 已安装并认证

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
│       └── tasks/route.ts      # 后台任务管理
├── components/
│   ├── ProjectCard.tsx         # 项目卡片
│   ├── ChatWindow.tsx          # 聊天窗口
│   ├── MessageBubble.tsx       # 消息气泡
│   └── TaskPanel.tsx           # 任务面板
├── lib/
│   ├── claude.ts               # Claude CLI 进程封装
│   ├── projects.ts             # 项目扫描与识别
│   └── types.ts                # TypeScript 类型定义
└── stores/
    └── chat.ts                 # Zustand 聊天状态管理
```

## 使用说明

| 操作 | 说明 |
|------|------|
| 点击项目卡片 | 进入项目聊天页 |
| `Enter` | 发送消息，即时对话 |
| `Shift+Enter` | 输入换行 |
| `⌘+Enter` | 下发后台任务（无人值守） |
| Tasks 按钮 | 打开/关闭右侧任务面板 |

## 支持的项目类型

自动识别以下语言/框架：

JavaScript/TypeScript, Rust, Go, Python, Elixir, Ruby, Java/Kotlin, C/C++, Dart/Flutter

## License

MIT
