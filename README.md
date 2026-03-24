# Teacher Agent Notebook

Teacher Agent Notebook 是一个面向学习场景的 AI 笔记本应用。

它的核心体验不是“单纯聊天”，而是让一个 `Teacher Agent` 一边生成结构化学习材料，一边基于这些材料持续辅导学生。整个工作区围绕三栏展开：

- 文件树：管理当前 session 下的所有学习文件
- Markdown 编辑器：直接编辑 `guidance.md`、`ground-truth.md`、`milestones.md` 等内容
- 聊天面板：和 Teacher 对话，引用文件片段，查看工具调用与流式回复

项目的长期方向是成为一个 **Context Orchestrator**:

- Everything is a file：上下文、提示词、聊天材料、用户 profile 都以文件形式存在
- 人机双向编排：用户可以手动选择上下文，Agent 也可以主动读写和组织文件
- 精确引用：聊天里可以通过 `[file:startLine:endLine]` 关联代码或材料片段

## What It Can Do
- 创建学习 session，并为每个 session 维护独立文件目录
- 让 Teacher Agent 生成和编辑 `guidance.md`、`ground-truth.md`、`milestones.md` 等材料
- 在聊天中引用文件片段，服务端会自动解析引用并注入上下文
- 通过 SSE 流式返回文本、工具调用和工具结果
- 把 Agent 工具调用过程可视化展示在聊天中
- 运行时切换 LLM 配置，无需重启服务
- 选择性注入 profile block 和 session prompt
- 对长聊天历史做分页加载和虚拟列表渲染，避免一次性渲染全部消息

## Tech Stack
- Client: React 19, Vite 6, Tailwind 4, TipTap, react-markdown
- Server: Express 5, Vercel AI SDK v6, `@ai-sdk/openai`
- Storage: JSON files + Markdown files
- Testing: Vitest, Testing Library, Supertest, jsdom
- Repo: npm workspaces + TypeScript strict

## Quick Start
### 1. Install
```bash
npm install
```

### 2. Configure LLM
Create a `.env` file in the repo root:

```bash
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=
```

Notes:

- The server expects an OpenAI-compatible API.
- If LLM is not configured, the app can still be used as a file-oriented notebook, but chat generation will be disabled.

### 3. Start Development
```bash
npm run dev
```

Defaults:

- Client: `http://localhost:5173`
- Server: `http://localhost:3001`

You can also run each side separately:

```bash
npm run dev:server
npm run dev:client
```

## Useful Commands
```bash
npm test
npm run lint
node ./node_modules/typescript/bin/tsc --noEmit -p packages/server/tsconfig.json
node ./node_modules/typescript/bin/tsc --noEmit -p packages/client/tsconfig.json
```

## Repository Layout
```text
packages/
  client/
    src/
      components/
      hooks/
      api/
  server/
    src/
      routes/
      services/
      db/
data/
  sessions.json
  {sessionId}/
    messages.json
    guidance.md
    ground-truth.md
    milestones.md
    session-prompt.md
    context-config.json
```

## How It Works
### Session Model
- A session is intentionally thin: `id`, `concept`, `createdAt`
- All real learning state lives in files under `data/{sessionId}/`

### Chat Flow
1. User sends a message, optionally with file references
2. Server resolves references and assembles context
3. LLM runs with file tools
4. Server streams `text-delta`, `tool-call`, `tool-result`, `done`
5. Client updates chat and file list in real time

### Long History Performance
- `GET /api/session/:id` returns session data plus only the recent page of messages
- `GET /api/session/:id/messages` supports loading older history with cursor pagination
- Client uses upward pagination and virtualized chat rendering for large sessions

## Important Files
- `packages/client/src/App.tsx`: main workspace shell
- `packages/client/src/hooks/useSession.ts`: chat/session state and SSE handling
- `packages/client/src/components/ChatPanel.tsx`: chat UI, streaming UI, virtualized history
- `packages/server/src/routes/session.ts`: session routes and message pagination
- `packages/server/src/routes/chat.ts`: streaming chat route
- `packages/server/src/services/llm.ts`: LLM client and tool definitions
- `packages/server/src/db/index.ts`: JSON-file persistence

## Current Product Direction
This app is evolving from “AI tutoring notebook” toward a general-purpose **context orchestration workspace**:

- richer context preview
- more explicit context selection
- chat history as editable/forkable files
- multimodal input and tool-augmented workflows

## Development Notes
- Keep session objects thin; prefer adding capability via files
- Maintain full-stack type safety when changing API contracts
- Prefer test-first changes for new behavior
- Run tests, both package typechecks, and lint before merging into `main`
