# Architecture

## What This Is

Teacher Agent Notebook — AI 教学工具。Teacher Agent 生成结构化学习材料并通过聊天辅导学生。三栏 UI：文件树 | 编辑器 | 聊天。

**核心愿景：上下文编排器 (Context Orchestrator)** — 让用户自由选择、编辑、组合传给 LLM 的上下文。一切皆文件。

## Tech Stack

| Layer | Stack |
|-------|-------|
| Client | React 19 · Vite 6 · Tailwind 4 · react-markdown |
| Server | Express 5 · Vercel AI SDK v6 · @ai-sdk/openai |
| LLM | OpenAI-compatible API (DashScope / OpenAI / etc.) |
| Storage | JSON files + Markdown files (no database) |
| Monorepo | npm workspaces · TypeScript strict · ES2022 |

## System Overview

```mermaid
graph TB
    subgraph Client ["Client (React + Vite)"]
        LP[Landing Page<br/>sidebar + dashboard]
        WS[Workspace<br/>FileTree / Editor / Chat]
        API[api/client.ts<br/>REST + SSE stream]
    end

    subgraph Server ["Server (Express)"]
        SR[routes/session.ts<br/>Session CRUD + SSE Chat]
        FR[routes/files.ts<br/>File CRUD + Settings]
        LLM[services/llm.ts<br/>LLM client + tools]
        FS[services/fileService.ts<br/>Sandboxed file I/O]
        ST[db/index.ts<br/>JSON Store]
    end

    subgraph Data ["data/ (filesystem)"]
        SJ[sessions.json]
        PM[profile.md]
        SP[system-prompt.md]
        SD["📁 {sessionId}/<br/>messages.json<br/>guidance.md<br/>ground-truth.md<br/>milestones.md"]
    end

    LP & WS --> API
    API -- "REST + SSE" --> SR & FR
    SR --> LLM --> FS
    SR & FR --> ST --> SJ
    FR --> FS
    FS --> SD
    LLM -- "streamText + tools" --> EXT["External LLM API"]
```

## Chat Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant L as LLM
    participant F as FileService

    U->>C: Send message + [file:1:10] refs
    C->>S: POST /session/:id/chat
    S->>F: Resolve file references
    S->>S: Build message history
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

**Session 保持薄** — `{ id, concept, createdAt }` 三个字段，永不膨胀。所有丰富度来自 session 目录下的文件：

```
data/{sessionId}/
├── messages.json       # 聊天历史
├── guidance.md         # Teacher 生成的教学指南
├── ground-truth.md     # 知识文档
├── milestones.md       # 学习进度 (- [x] / - [ ])
├── session-prompt.md   # session 级教学指令（追加到全局 prompt）
└── ...                 # 任意文件，everything is a file
```

## Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Everything is a file** | 学习材料、profile、prompt、未来的聊天历史都是可编辑文件 |
| **Agent 解耦** | `toolEvents`/`parts` 为可选字段。无 LLM 时退化为纯笔记工具 |
| **沙箱安全** | FileService 路径遍历防护，所有操作限制在 session 目录内 |
| **流式优先** | 全程 SSE，客户端实时渲染文本增量和工具事件 |
| **Thin handles, rich files** | Session 对象是目录指针，文件是内容，不往 Session 塞字段 |

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/session` | List sessions |
| POST | `/api/session` | Create session |
| GET | `/api/session/:id` | Get session + messages |
| POST | `/api/session/:id/chat` | SSE streaming chat |
| GET | `/api/session/:id/milestones` | Milestone progress |
| GET | `/api/:sid/files` | List session files |
| GET | `/api/:sid/file?path=` | Read file |
| PUT | `/api/:sid/file` | Write file |
| DELETE | `/api/:sid/file?path=` | Delete file |
| GET/PUT | `/api/profile` | User profile |
| GET/PUT | `/api/system-prompt` | Custom system prompt |
| GET | `/api/llm-status` | LLM config status |

---

## Architecture Evolution

### Current: Direct Assembly

上下文在路由层临时拼接，用户不可见、不可选。

```mermaid
graph LR
    UP[User Profile<br/>profile.md] --> R[route handler<br/>临时拼接]
    SP[System Prompt<br/>resolveSystemPrompt] --> R
    UM[User Message<br/>+ file refs] --> R
    R --> LLM["LLM Call"]

    style R fill:#ef4444,color:#fff
```

### Next: Context Assembler

引入 **Context Assembler** — 用户可见的上下文选择中间层。

```mermaid
graph LR
    subgraph Sources ["上下文源 (Everything is a file)"]
        SP[🔧 System Prompt<br/>全局 + session 级]
        PF[👤 Profile 分块<br/>用户勾选子集]
        SF[📄 Session 文件<br/>file:startLine:endLine]
        HI[💬 历史 Session<br/>跨 session 引用]
    end

    subgraph Assembler ["Context Assembler"]
        SEL[用户选择配置<br/>context-config.json]
        ASM[contextAssembler.ts<br/>汇集 + 组装]
    end

    SP & PF & SF & HI --> SEL
    SEL --> ASM
    UM[User Message] --> ASM
    ASM --> LLM["LLM Call"]

    style ASM fill:#10b981,color:#fff
    style SEL fill:#6366f1,color:#fff
```

**关键变化：**
- 用户主动勾选哪些文件/块参与对话
- 选择配置存为 `data/{sessionId}/context-config.json`（everything is a file）
- `GET /api/session/:id/context-preview` 可预览 LLM 即将看到的完整上下文
- 第一步：Profile 分块选择 → 验证链路 → 扩展到其他源

### Future: Full Orchestration

```mermaid
graph TB
    subgraph User ["用户侧"]
        CTX[上下文选择面板<br/>勾选/拖拽/搜索]
        ED[文件编辑器<br/>引用即定位]
        CH[聊天面板<br/>多模态输入]
    end

    subgraph Core ["核心层"]
        ASM[Context Assembler<br/>块解析 + 汇集 + 预览]
        AG[Teacher Agent<br/>工具调用 + 流式响应]
    end

    subgraph Storage ["一切皆文件"]
        F1[学习材料 .md]
        F2[聊天历史 .jsonl]
        F3[搜索结果 references/]
        F4[共享文件 data/shared/]
        F5[上下文配置 .json]
    end

    CTX --> ASM
    CH --> AG
    ASM --> AG
    AG --> F1 & F2 & F3
    ED --> F1
    F1 & F2 & F3 & F4 & F5 --> ASM

    style ASM fill:#10b981,color:#fff
    style AG fill:#6366f1,color:#fff
```

**演进路线：**

```
Phase 1 — 基础编排
  ✅ System Prompt 文件化 + 运行时读取
  → Session 级教学指令（追加到 prompt）
  → Profile 分块 + 选择性注入
  → Context Assembler 核心框架

Phase 2 — 可见的上下文
  → 上下文预览面板（模型看到了什么）
  → 文件段落级选择 UI
  → 跨 session 文件引用

Phase 3 — 完整编排
  → 聊天历史文件化 + Fork
  → 多模态输入（图片/视觉）
  → Agent 联网搜索 → 结果自动归档为文件
  → 全局共享文件区
```
