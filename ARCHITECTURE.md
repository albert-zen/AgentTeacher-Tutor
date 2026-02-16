# 架构文档

## 项目概述

Teacher Agent Notebook — AI 驱动的教学工具。Teacher Agent 创建结构化学习材料（guidance.md、ground-truth.md、milestones.md），通过聊天交互辅导学生。三栏 UI：文件树 | Markdown 编辑器 | 聊天面板。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + Vite 6 + Tailwind CSS 4 + react-markdown |
| 后端 | Express 5 + Vercel AI SDK v6 + @ai-sdk/openai |
| LLM | OpenAI 兼容 API（当前配置 DashScope glm-4.7） |
| 存储 | JSON 文件（无数据库） |
| 构建 | npm workspaces monorepo，TypeScript strict |

## 目录结构

```
AgentTeacher&Tutor/
├── .env                          # LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
├── package.json                  # monorepo root, scripts: dev/test
├── tsconfig.base.json            # 共享 TS 配置 (ES2022, strict)
├── data/                         # 运行时数据（git ignored）
│   ├── sessions.json             # 所有 session 元数据
│   ├── profile.md                # 用户个人上下文
│   └── {sessionId}/              # 每个 session 一个目录
│       ├── messages.json         # 聊天记录
│       ├── guidance.md           # Teacher 生成的学习指南
│       ├── ground-truth.md       # Teacher 生成的知识文档
│       └── milestones.md         # 学习里程碑 (- [x]/- [ ])
│
├── packages/server/
│   ├── src/
│   │   ├── index.ts              # Express 入口，挂载路由
│   │   ├── types.ts              # 共享类型定义
│   │   ├── db/index.ts           # Store: JSON 文件持久化
│   │   ├── routes/
│   │   │   ├── session.ts        # Session CRUD + SSE 聊天端点
│   │   │   └── files.ts          # 文件 CRUD + Profile 端点
│   │   └── services/
│   │       ├── llm.ts            # LLM 客户端、工具定义、system prompt
│   │       ├── teacher.ts        # 工具执行分发层
│   │       ├── fileService.ts    # 沙箱文件 I/O（路径遍历防护）
│   │       ├── referenceParser.ts # [file:start:end] 引用解析
│   │       └── milestonesParser.ts # 里程碑 markdown 解析
│   └── __tests__/                # vitest 测试
│
└── packages/client/
    ├── vite.config.ts            # 开发代理 /api → localhost:3001
    ├── src/
    │   ├── main.tsx              # React 入口
    │   ├── index.css             # Tailwind 4 + @tailwindcss/typography
    │   ├── App.tsx               # 主布局、状态编排
    │   ├── api/client.ts         # REST + SSE 流式客户端
    │   ├── hooks/
    │   │   ├── useSession.ts     # Session/消息/流式状态管理
    │   │   └── useTextSelection.ts # 文本选中 → 行号映射
    │   └── components/
    │       ├── FileTree.tsx       # 文件树（创建/删除/选择）
    │       ├── MarkdownEditor.tsx # Markdown 预览/编辑切换
    │       ├── ChatPanel.tsx      # 聊天面板（消息、chips、工具事件）
    │       ├── MilestoneBar.tsx   # 里程碑进度条
    │       └── SelectionPopup.tsx # 选中文本浮窗 "Ask Teacher"
    └── index.html
```

## 服务端架构

### 分层

```
HTTP 请求
  │
  ├── routes/session.ts ─── 聊天 SSE、Session CRUD
  │     │
  │     ├── db/index.ts (Store) ─── 读写 sessions.json / messages.json
  │     ├── services/llm.ts ─── 构建 LLM 客户端、定义工具、发起 streamText
  │     │     └── services/teacher.ts ─── executeToolCall 分发
  │     │           └── services/fileService.ts ─── 沙箱文件读写
  │     └── services/referenceParser.ts ─── 解析消息中的文件引用
  │
  └── routes/files.ts ─── 文件 CRUD、Profile 端点
        └── services/fileService.ts
```

### 关键文件说明

**`routes/session.ts`** — `createSessionRouter(store, dataDir, llmConfig)`

| 端点 | 功能 |
|------|------|
| `GET /` | 列出所有 session |
| `POST /` | 创建 session（UUID + 概念） |
| `GET /:id` | 获取 session + 完整聊天记录 |
| `POST /:id/chat` | SSE 流式聊天（核心端点） |

聊天端点流程：
1. 解析消息中的 `[file:start:end]` 引用
2. 通过 FileService 读取引用内容，追加到用户消息
3. 保存用户消息到 Store
4. 构建 ModelMessage 历史，调用 `streamTeacherResponse()`
5. 逐个 SSE 事件发送：`text-delta` | `tool-call` | `tool-result` | `done` | `error`
6. 累积有序 `MessagePart[]`（文本与工具事件交错），保存到助手消息

**`services/llm.ts`** — LLM 集成层

- `createLLMClient(config)` — 通过 `@ai-sdk/openai` 创建客户端，使用 `.chat()` 强制 `/chat/completions` 端点
- `buildTools(fileService)` — 定义两个 Zod schema 工具：`read_file`、`write_file`
- `getSystemPrompt()` — Teacher Agent 的中文 system prompt
- `streamTeacherResponse()` — 调用 Vercel AI SDK v6 的 `streamText()`，限制 `stopWhen: stepCountIs(10)`

**`services/fileService.ts`** — 沙箱文件服务

- 路径遍历防护：`resolvePath()` 检测 `..` 逃逸
- 支持全文件和行范围读写（1-based 行号）
- 自动创建父目录

**`db/index.ts`** — JSON 文件存储

- `data/sessions.json` — 所有 session 元数据数组
- `data/{sessionId}/messages.json` — 单个 session 的消息数组
- 无锁、无并发控制（单用户场景）

### 类型系统（`types.ts`）

```typescript
// Agent 解耦：toolEvents、parts 均为可选字段
// 无 LLM 时 notebook 可作为纯笔记应用使用
interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  references?: FileReference[];   // 用户消息的文件引用
  toolEvents?: ToolEvent[];       // 工具调用记录（向后兼容）
  parts?: MessagePart[];          // 有序内容序列（文本 + 工具交错）
  createdAt: string;
}

type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'tool-call'; toolName: string; args?: Record<string, unknown> }
  | { type: 'tool-result'; toolName: string; result?: unknown };
```

## 客户端架构

### 组件层次

```
App.tsx (主编排)
├── Landing Page（无 session 时）
│   ├── 概念输入框 + 开始按钮
│   └── 历史 session 列表
│
└── Workspace（有 session 时）
    ├── Header（← Sessions 按钮 + 当前概念）
    └── 三栏布局
        ├── FileTree (w-52)
        │     文件列表、创建、删除
        │
        ├── 编辑区域 (flex-1)
        │   ├── MilestoneBar
        │   │     解析 milestones.md → 进度 pill
        │   └── MarkdownEditor
        │         预览/编辑切换，onCopy 跟踪
        │
        └── ChatPanel (w-96)
              ├── 消息列表
              │   ├── 用户消息（蓝色，右对齐）+ 引用 badges
              │   └── 助手消息（灰色，左对齐）+ 工具卡片
              ├── 流式指示器（"思考中..." / 部分消息）
              └── 输入区域
                  ├── Attachment chips（文件引用 / 引用文本）
                  └── Textarea + 发送按钮

SelectionPopup（全局浮窗，选中文本时出现）
```

### 状态管理

```
useSession()
├── session: Session | null
├── messages: ChatMessage[]
├── files: string[]
├── streaming: boolean
├── streamingParts: MessagePart[]
├── startSession(concept)    → 创建 session + 发送初始消息
├── loadSession(id)          → 加载已有 session
├── clearSession()           → 中断流 + 重置状态
├── send(message, refs)      → 发送消息 + SSE 流消费
└── refreshFiles()           → 刷新文件列表

useTextSelection()
├── selection: TextSelection | null
├── handleSelection(fileName, content) → DOM 选中 → 行号
└── getReference() → "[file:start:end]" 字符串
```

### 附件系统

```
用户操作                      产生的 Attachment
─────────────                 ──────────────────
编辑器选中 → Ask Teacher  →  { type: 'file-ref', file, startLine, endLine }
编辑器复制 → 聊天粘贴     →  { type: 'file-ref', ... }（智能粘贴匹配 copySource）
其他文本选中 → Ask Teacher →  { type: 'quote', text }

提交时：
- file-ref → 转为 [file:start:end] 前缀 + FileRef 数组
- quote → 转为 blockquote 前缀
- 拼接到用户消息文本，通过 onSend 发送
```

## 数据流

### 完整聊天流程

```
┌─────────┐     POST /session/:id/chat      ┌─────────┐
│  Client  │ ──────────────────────────────→ │  Server  │
│          │     { message, references }     │          │
│          │                                 │          │
│          │  ←── SSE: text-delta ───────── │  LLM     │
│          │  ←── SSE: tool-call ────────── │  ↕       │
│          │  ←── SSE: tool-result ──────── │  Tools   │
│          │  ←── SSE: text-delta ───────── │  (read/  │
│          │  ←── SSE: done ─────────────── │  write)  │
└─────────┘                                 └─────────┘
     │                                           │
     │ refreshFiles() on tool-result             │ FileService
     │ 重新加载活动文件内容                         │ 沙箱读写
     ↓                                           ↓
  UI 更新                                    data/{sessionId}/
```

### 文件操作来源

```
来源 1: 用户手动编辑
  MarkdownEditor → onSave → api.writeFile() → FileService

来源 2: Teacher Agent 工具调用
  LLM → tool-call(write_file) → teacher.executeToolCall() → FileService
  → SSE tool-result → 客户端 refreshFiles()

来源 3: 用户创建/删除文件
  FileTree → onCreate/onDelete → api.writeFile/deleteFile → FileService
```

## Vercel AI SDK v6 集成细节

```typescript
// 关键 API 差异（v6 vs 旧版本）
streamText({
  model,                     // createOpenAI().chat(model)
  system: getSystemPrompt(),
  messages,                  // ModelMessage[]（非 CoreMessage）
  tools: buildTools(fs),     // tool() + inputSchema（非 parameters）
  stopWhen: stepCountIs(10), // 非 maxSteps
});

// 流式 parts 访问
for await (const part of stream.fullStream) {
  part.type === 'text-delta'  → part.text      // 非 textDelta
  part.type === 'tool-call'   → part.input     // 非 args
  part.type === 'tool-result' → part.output    // 非 result
}
```

## 设计原则

### Agent 解耦
- `ToolEvent`、`toolEvents`、`parts` 均为 `?` 可选字段
- 无 LLM 配置时，应用退化为纯笔记工具（文件编辑 + 手动聊天记录）
- 服务端 `isLLMConfigured()` 检查，未配置时返回中文错误提示

### Everything is a File
- 学习材料以 markdown 文件存储，文件即数据
- 用户上下文（profile.md）文件化
- 未来方向：聊天历史也文件化，支持编辑/fork

### 沙箱安全
- FileService 路径遍历防护，所有操作限制在 session 目录内
- 文件列表排除 `messages.json` 和隐藏文件

### 流式优先
- 聊天响应全程 SSE 流式
- 客户端实时渲染文本增量和工具调用事件
- `tool-result` 事件触发自动刷新文件列表

## API 端点汇总

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/session` | 列出所有 session |
| POST | `/api/session` | 创建 session |
| GET | `/api/session/:id` | 获取 session + 消息 |
| POST | `/api/session/:id/chat` | SSE 流式聊天 |
| GET | `/api/:sessionId/files` | 列出 session 文件 |
| GET | `/api/:sessionId/file?path=` | 读取文件（支持行范围） |
| PUT | `/api/:sessionId/file` | 写入文件（支持行范围） |
| DELETE | `/api/:sessionId/file?path=` | 删除文件 |
| GET | `/api/profile` | 读取用户 profile |
| PUT | `/api/profile` | 更新用户 profile |
