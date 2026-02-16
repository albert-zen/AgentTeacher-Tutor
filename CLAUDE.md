# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Teacher Agent Notebook — an AI-powered educational tool where a Teacher Agent creates structured learning materials (guidance.md, ground-truth.md, milestones.md) and interactively tutors students through chat. Three-panel UI: file tree, markdown editor, chat panel.

## 发展方向：上下文编排器 (Context Orchestrator)

本应用的核心演进方向是成为一个**上下文编排器**——让人和 Agent 都能灵活、自由地构建、编辑、选择传入给模型的上下文。

关键理念：
- **Everything is a file**：所有上下文（学习材料、用户 profile、聊天历史）均以文件形式存在，可编辑、可引用、可 fork
- **人机双向编排**：用户可以手动选择/编辑上下文片段传给 Agent；Agent 也可以主动读取/创建/组织上下文文件
- **分块与选择**：上下文文件按标题或标签分块，用户可按需勾选哪些块参与当前对话
- **引用即定位**：`[file:startLine:endLine]` 引用体系贯穿编辑器和聊天，精确关联上下文来源

## Commands

```bash
npm run dev            # Start both server (3001) and client (5173) concurrently
npm run dev:server     # Server only (tsx watch, auto-reload)
npm run dev:client     # Vite dev server only

npm test               # Run all vitest tests (single run)
npm run test:watch     # Vitest watch mode
npm test -- --grep="pattern"  # Run specific test by name
```

Tests live in `packages/server/__tests__/`. No client-side tests exist yet.

## Architecture

**Monorepo** with npm workspaces: `packages/client` (React 19 + Vite + Tailwind 4) and `packages/server` (Express 5 + Vercel AI SDK).

### Server (`packages/server/src/`)

- **`routes/session.ts`** — All API routes. Single router factory `createSessionRouter(store, dataDir, llmConfig)`. Chat endpoint (`POST /:id/chat`) uses SSE streaming.
- **`services/llm.ts`** — LLM integration via Vercel AI SDK's `streamText`. Defines `read_file`/`write_file` tools with Zod schemas. Uses `@ai-sdk/openai` with `.chat()` to force `/chat/completions` endpoint (required for OpenAI-compatible providers like DashScope).
- **`services/teacher.ts`** — Tool execution layer. `executeToolCall()` dispatches tool calls to FileService.
- **`services/fileService.ts`** — Sandboxed file I/O. All paths resolved relative to a session's base directory with path traversal protection. Supports full-file and line-range read/write (1-based line numbers).
- **`services/referenceParser.ts`** — Parses `[filename:startLine:endLine]` references from user messages.
- **`services/milestonesParser.ts`** — Parses milestone checkbox format (`- [x]`/`- [ ]`) from milestones.md.
- **`db/index.ts`** — `Store` class: JSON-file-based persistence. Sessions in `data/sessions.json`, messages in `data/{sessionId}/messages.json`.
- **`types.ts`** — Shared type definitions (Session, ChatMessage, FileReference, Milestones, ToolEvent, SSEEvent). Agent-specific types (ToolEvent, toolEvents on ChatMessage) are optional — the notebook works as a standalone note app when LLM is not configured.

### Client (`packages/client/src/`)

- **`App.tsx`** — Main layout. Landing page (concept input + session list) or three-panel workspace (FileTree | Editor+MilestoneBar | ChatPanel). Orchestrates file loading, selection tracking, and message sending.
- **`hooks/useSession.ts`** — Core state hook. Manages session, messages, files, streaming state. Handles SSE stream consumption and auto-refreshes files after tool-result events.
- **`hooks/useTextSelection.ts`** — Tracks text selection with line-number precision for file references.
- **`api/client.ts`** — API client. REST calls + `streamChat()` which manually parses SSE via ReadableStream.

### Data Flow

1. User sends message → `POST /session/:id/chat` with optional `[file:line:line]` references
2. Server resolves references by reading files, appends content to user message
3. `streamText()` calls LLM with system prompt + conversation history + tools
4. LLM may invoke `read_file`/`write_file` tools (up to `stopWhen: stepCountIs(10)`)
5. Server streams SSE events: `text-delta`, `tool-call`, `tool-result`, `done`
6. Client refreshes file list on every `tool-result` event to reflect Teacher's file changes
7. Tool events are accumulated during streaming and persisted on the assistant ChatMessage

### Key Conventions

- Session files are stored in `data/{sessionId}/` — one directory per session
- The LLM uses an OpenAI-compatible API (configured via `.env`: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`)
- The UI language is Chinese; system prompt instructs the Teacher to respond in the student's language
- Vite proxies `/api` requests to `localhost:3001` in development
- TypeScript strict mode, ES2022 target, ESNext modules throughout
- Vercel AI SDK v6: uses `ModelMessage` (not CoreMessage), `inputSchema` (not parameters), `stopWhen` (not maxSteps), `part.input`/`part.output` (not args/result), `part.text` (not textDelta)
- Agent layer is decoupled via optional types: `ToolEvent`, `toolEvents` on `ChatMessage` are `?` optional — absent when LLM is not configured
- Lint: ESLint (flat config `eslint.config.js`)，Format: Prettier (`.prettierrc`)。根目录统一配置，两个包共享
- 运行 `npm run lint` 检查，`npm run format` 格式化。提交前必须通过 lint

### 开发规范

- **TDD（测试驱动开发）**：先写测试，再写实现，确保每个功能有对应测试覆盖。服务端测试在 `packages/server/__tests__/`，使用 vitest
- **全栈类型安全**：服务端 `types.ts` 定义的类型需与客户端 `api/client.ts` 的类型保持同步。接口变更必须同时更新两端类型，确保端到端 type-safe
- **分支开发**：每个新功能从 `main` 新建 feature 分支（如 `feature/resize-panels`），开发完成后由用户审核再合入 main
- **小步提交**：每个有意义的变更单独提交，commit message 清晰描述变更内容。避免大型混合提交
- **合入流程**：功能完成 → 运行 `npm test` 确保全部通过 → 两端 `tsc --noEmit` 无类型错误 → 用户审核 → 合入 main
