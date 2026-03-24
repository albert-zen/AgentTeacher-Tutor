# Architecture

## What This Is

Teacher Agent Notebook — AI 教学工具。Teacher Agent 生成结构化学习材料并通过聊天辅导学生。三栏 UI：文件树 | 编辑器 | 聊天。

**核心愿景：上下文编排器 (Context Orchestrator)** — 让用户自由选择、编辑、组合传给 LLM 的上下文。一切皆文件。

## Tech Stack

| Layer | Stack |
|-------|-------|
| Client | React 19 · Vite 6 · Tailwind 4 · react-markdown · react-syntax-highlighter |
| Server | Express 5 · Vercel AI SDK v6 · @ai-sdk/openai |
| LLM | OpenAI-compatible API (DashScope / OpenAI / etc.)，运行时可切换 |
| Storage | JSON files + Markdown files (no database) |
| Testing | vitest · supertest · jsdom · @testing-library/react · 196 tests |
| Monorepo | npm workspaces · TypeScript strict · ES2022 |

## System Overview

```mermaid
graph TB
    subgraph Client ["Client (React + Vite)"]
        LP[Landing Page<br/>sidebar + settings + draft]
        WS[Workspace<br/>FileTree / Editor / Chat]
        API[api/client.ts<br/>REST + SSE stream]
    end

    subgraph Server ["Server (Express)"]
        SR[routes/session.ts<br/>Session CRUD + message pagination + context preview]
        CR[routes/chat.ts<br/>SSE chat streaming]
        FR[routes/files.ts<br/>File CRUD + Settings]
        CC[services/contextCompiler.ts<br/>Context preview + compile pipeline]
        LLM[services/llm.ts<br/>LLM client + tools + config]
        PP[services/profileParser.ts<br/>Profile block parsing]
        FS[services/fileService.ts<br/>Sandboxed file I/O]
        ST[db/index.ts<br/>JSON Store]
    end

    subgraph Data ["data/ (filesystem)"]
        SJ[sessions.json]
        PM[profile.md]
        SP[system-prompt.md]
        SPD[session-prompt-draft.md]
        LC[llm-config.json]
        SD["📁 {sessionId}/<br/>messages.json · guidance.md<br/>session-prompt.md · context-config.json<br/>milestones.md · ground-truth.md"]
    end

    LP & WS --> API
    API -- "REST + SSE" --> SR & CR & FR
    SR --> CC
    CR --> CC --> LLM
    CC --> PP
    SR & CR & FR --> ST --> SJ
    FR --> FS
    CR --> FS
    FS --> SD
    LLM -- "streamText + tools" --> EXT["External LLM API"]
```

## Chat Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant CC as ContextCompiler
    participant L as LLM
    participant F as FileService

    U->>C: Send message + [file:1:10] refs
    C->>S: POST /session/:id/chat
    S->>CC: compileContext(dataDir, store, sessionId, message)
    CC->>F: Resolve file references
    CC-->>S: system + messages + resolvedUserContent
    S->>L: streamText(system + messages + tools)

    loop Tool calls (max 10 steps)
        L-->>S: tool-call (read_file / write_file)
        S->>F: Execute tool
        F-->>S: Result
        S-->>C: SSE: tool-call → tool-result
        C->>C: refreshFiles()
    end

    L-->>S: text-delta (streaming)
    S-->>C: SSE: text-delta → done
    C->>C: Render message + refresh UI
```

## Data Model

```mermaid
erDiagram
    SESSION ||--o{ MESSAGE : contains
    SESSION ||--o{ FILE : "has files"
    SESSION {
        string id PK
        string concept
        string createdAt
    }
    MESSAGE {
        string id PK
        string sessionId FK
        string role "user | assistant"
        string content
        array references "optional"
        array toolEvents "optional"
        array parts "optional"
    }
    FILE {
        string path PK
        string content
        int totalLines
    }
```

**Session 保持薄** — `{ id, concept, createdAt }` 三个字段，永不膨胀。消息历史分页读取，但底层仍保存在 `messages.json` 中；其余丰富度来自 session 目录下的文件：

```
data/
├── profile.md                  # 用户档案（按 # 标题分块）
├── system-prompt.md            # 全局系统提示词
├── session-prompt-draft.md     # 教学指令草稿（新 session 自动复制）
├── llm-config.json             # LLM 运行时配置（env fallback）
├── sessions.json               # session 索引
│
└── {sessionId}/
    ├── messages.json            # 聊天历史
    ├── session-prompt.md        # session 级教学指令（追加到 prompt）
    ├── context-config.json      # 上下文选择配置
    ├── guidance.md              # Teacher 教学指南
    ├── ground-truth.md          # 知识文档
    ├── milestones.md            # 学习进度 (- [x] / - [ ])
    └── ...                      # 任意文件
```

## Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Everything is a file** | 学习材料、profile、prompt、config 都是可编辑文件 |
| **Agent 解耦** | `toolEvents`/`parts` 为可选字段。无 LLM 时退化为纯笔记工具 |
| **沙箱安全** | FileService 路径遍历防护，所有操作限制在 session 目录内 |
| **流式优先** | 全程 SSE，客户端实时渲染文本增量和工具事件 |
| **Thin handles, rich files** | Session 是目录指针，文件是内容，不往 Session 塞字段 |
| **运行时可配** | LLM config 存文件，运行时切换无需重启 |

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/session` | List sessions |
| POST | `/api/session` | Create session（自动复制 draft → session-prompt） |
| GET | `/api/session/:id` | Get session + recent message page |
| GET | `/api/session/:id/messages` | Load older chat history by cursor |
| POST | `/api/session/:id/chat` | SSE streaming chat |
| GET | `/api/session/:id/milestones` | Milestone progress |
| GET | `/api/session/:id/context-preview` | Preview assembled context |
| PUT | `/api/session/:id/context-config` | Save context selection config |
| GET | `/api/:sid/files` | List session files |
| GET | `/api/:sid/file?path=` | Read file |
| PUT | `/api/:sid/file` | Write file |
| DELETE | `/api/:sid/file?path=` | Delete file |
| GET/PUT | `/api/profile` | User profile |
| GET | `/api/profile/blocks` | Parsed profile blocks |
| GET/PUT | `/api/system-prompt` | Custom system prompt |
| GET/PUT | `/api/session-prompt-draft` | Session prompt template |
| GET | `/api/llm-status` | LLM config status (read-only) |
| PUT | `/api/llm-config` | Update LLM config at runtime |

---

## Context Assembly (当前状态)

`contextCompiler.ts` 现在同时承担两类职责：

- `assembleContext()`：为 `/context-preview` 提供轻量上下文预览
- `compileContext()`：完成聊天请求所需的 5 阶段编排流水线

```mermaid
graph LR
    subgraph Preview ["assembleContext()"]
        P1["Resolve Sources<br/>system prompt + profile blocks"]
        P2["Select Blocks<br/>context-config 过滤"]
    end

    subgraph Compile ["compileContext()"]
        S1["1. Resolve Sources<br/>global + session prompt"]
        S2["2. Select Blocks<br/>profile 分块 + 过滤"]
        S3["3. Merge Refs<br/>解析 file:s:e 引用"]
        S4["4. Format<br/>构建 system XML"]
        S5["5. Build Messages<br/>拼接历史和当前用户消息"]
    end

    P1 --> P2
    S1 --> S2 --> S3 --> S4 --> S5
```

当前状态下，聊天上下文主流程已经从路由中提取到 `compileContext()`；后续仍可继续收敛 preview/compile 之间的重复逻辑。

---

## Architecture Evolution

```
Phase 1 — 基础编排 ✅
  ✅ System Prompt 文件化 + session 级追加
  ✅ Session prompt draft 模板 → 新 session 自动复制
  ✅ LLM 运行时配置切换
  ✅ Profile 分块解析 + 选择性注入
  ✅ Context Compiler 完整聊天流水线 (Stage 1-5)
  ✅ Session 标题自动摘要
  ✅ 长聊天历史分页 + 虚拟列表

Phase 2 — 可见的上下文 (next)
  → 上下文预览面板 UI（模型看到了什么）
  → Profile 块选择接入 context-config
  → 跨 session 文件引用

Phase 3 — 完整编排
  → Part Accumulator 共享提取
  → 聊天历史文件化 + Fork
  → 多模态输入（图片/视觉）
  → Agent 联网搜索 → 结果归档为文件
```
