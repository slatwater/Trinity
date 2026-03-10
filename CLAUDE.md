# Trinity

Claude Code 本地开发流程可视化客户端。

## 技术栈

- Next.js 15 (App Router) + TypeScript + Tailwind CSS v4
- Zustand 状态管理
- Claude CLI (`claude -p --output-format stream-json`) 交互
- SSE 流式传输

## 开发命令

```bash
npm run dev    # 开发服务器 localhost:3000
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
│       └── tasks/route.ts    # 后台任务管理
├── components/
│   ├── ProjectCard.tsx       # 项目卡片
│   ├── ChatWindow.tsx        # 聊天窗口
│   ├── MessageBubble.tsx     # 消息气泡
│   └── TaskPanel.tsx         # 任务面板
├── lib/
│   ├── claude.ts             # Claude CLI 封装
│   ├── projects.ts           # 项目扫描器
│   └── types.ts              # 类型定义
└── stores/
    └── chat.ts               # Zustand 聊天状态
```

## 环境变量

- `TRINITY_WORKSPACE`: 工作区根目录，默认 `~/Projects/`

## 代码规范

- 组件用 "use client" 标记客户端组件
- API routes 使用 Next.js Route Handlers
- CSS 变量定义在 globals.css，不用 Tailwind 颜色
