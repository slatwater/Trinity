# Trinity

Claude Code 本地开发流程可视化客户端。

## 技术栈

- Next.js 15 (App Router) + TypeScript + Tailwind CSS v4
- Zustand 状态管理 + localStorage 持久化
- Claude CLI (`claude --print - --output-format stream-json --verbose`) 交互
- SSE 流式传输，stdout pipe 实时读取
- 多轮上下文：`--resume` 串联 session
- 无人值守：`--permission-mode bypassPermissions`

## 开发命令

```bash
npm run dev    # 开发服务器 localhost:3000（自动清除 CLAUDECODE 环境变量）
npm run build  # 生产构建
npm run lint   # ESLint
```

## 工程索引

```
src/
├── app/
│   ├── page.tsx              # 首页 - 项目仪表盘
│   ├── project/[id]/page.tsx # 项目聊天页
│   └── api/
│       ├── projects/route.ts # 扫描本地项目
│       ├── chat/route.ts     # 聊天 SSE 流
│       └── session/route.ts  # 会话管理（重置）
├── components/
│   ├── ProjectCard.tsx       # 项目卡片
│   ├── ChatWindow.tsx        # 聊天窗口
│   └── MessageBubble.tsx     # 消息气泡
├── lib/
│   ├── claude.ts             # Claude CLI 封装（--print - 模式）
│   ├── projects.ts           # 项目扫描器
│   └── types.ts              # 类型定义
└── stores/
    └── chat.ts               # Zustand 状态 + localStorage 持久化
```

## 环境变量

- `TRINITY_WORKSPACE`: 工作区根目录，默认 `~/Projects/`

## 代码规范

- 组件用 "use client" 标记客户端组件
- API routes 使用 Next.js Route Handlers
- CSS 变量定义在 globals.css，不用 Tailwind 颜色

## CLI 调用方式

关键发现：`claude -p "prompt"` 在 pipe 模式下 hang，`claude --print -` 从 stdin 传 prompt 正常工作。
启动时通过 `start.sh` 清除 `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT` 避免嵌套检测。
