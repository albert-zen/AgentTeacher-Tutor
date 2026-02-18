# Test Specification (EARS)

> **EARS** = Easy Approach to Requirements Specification
> 每条声明映射为一个 `it('...')` 测试用例，定义系统的行为契约。
>
> 标记：`✅` 已有测试 · `todo` 当前代码需补 · `future` 功能未实现
>
> EARS 模式：
> - **U** (Ubiquitous) — "The system **shall** ..." — 始终成立的不变量
> - **E** (Event-driven) — "**When** X, the system **shall** ..." — 对事件的响应
> - **S** (State-driven) — "**While** X, the system **shall** ..." — 状态依赖的行为
> - **X** (Unwanted) — "**If** X, **then** the system **shall** ..." — 错误/边界防护

---

## Server

---

### 1. 沙箱文件系统 `[✅ 22 tests]`

> `services/fileService.ts` — 所有文件操作限定在 session 目录内
> `packages/server/__tests__/fileService.test.ts`

#### 写入

| # | EARS | 状态 |
|---|------|------|
| E1 | When `writeFile` is called with a new path, FileService shall create the file and write full content | ✅ |
| E2 | When `writeFile` is called without line numbers on an existing file, FileService shall overwrite the entire file | ✅ |
| E3 | When `writeFile` is called with `startLine`/`endLine`, FileService shall replace only those lines, preserving the rest | ✅ |
| E4 | When `writeFile` targets a path in a non-existent subdirectory, FileService shall auto-create intermediate directories | ✅ |

#### 读取

| # | EARS | 状态 |
|---|------|------|
| E5 | When `readFile` is called without line numbers, FileService shall return full content and `totalLines` | ✅ |
| E6 | When `readFile` is called with `startLine`/`endLine`, FileService shall return only those lines | ✅ |

#### 安全边界

| # | EARS | 状态 |
|---|------|------|
| X1 | If the file path attempts directory traversal (`../`), then FileService shall reject the operation | ✅ |
| X2 | If `readFile` targets a non-existent file, then it shall throw | ✅ |
| X3 | If `endLine` exceeds file length, then `writeFile` shall throw | ✅ |
| X4 | If `startLine > endLine`, then `writeFile` shall throw | ✅ |

#### 尾换行一致性

| # | EARS | 状态 |
|---|------|------|
| U1 | FileService shall preserve trailing newline semantics across read→write→read cycles (10 edge-case variations) | ✅ |

---

### 2. 引用解析 `[✅ 8 tests]`

> `services/referenceParser.ts` — 解析和生成 `[file:start:end]` 引用
> `packages/server/__tests__/referenceParser.test.ts`

| # | EARS | 状态 |
|---|------|------|
| E1 | When text contains `[file.md:12:15]`, the parser shall extract `{ file, startLine, endLine }` | ✅ |
| E2 | When text contains `[file.md]` (no line numbers), the parser shall extract `{ file }` only | ✅ |
| E3 | When text contains multiple references, the parser shall extract all of them in order | ✅ |
| E4 | When text contains subdirectory paths like `[notes/draft.md:1:3]`, the parser shall parse correctly | ✅ |
| E5 | When generating a reference from selection info, the parser shall produce the `[file:start:end]` string | ✅ |
| X1 | If the format is invalid, then the parser shall ignore it | ✅ |
| X2 | If the input is empty, then the parser shall return an empty array | ✅ |

---

### 3. 里程碑解析 `[✅ 8 tests]`

> `services/milestonesParser.ts` — 解析 `- [x]`/`- [ ]` checkbox 格式
> `packages/server/__tests__/milestonesParser.test.ts`

| # | EARS | 状态 |
|---|------|------|
| E1 | When parsing milestones.md, the parser shall extract title and all items with completion status | ✅ |
| E2 | When `[X]` (uppercase) is used, the parser shall treat it as completed | ✅ |
| E3 | When serializing milestones, the parser shall produce valid markdown content | ✅ |
| U1 | The parser shall support serialize→parse round-trip without data loss | ✅ |
| X1 | If the file is empty, then the parser shall return empty title and empty items | ✅ |
| X2 | If a line has no checkbox format, then the parser shall skip it | ✅ |

---

### 4. 工具执行层 `[✅ 7 tests]`

> `services/teacher.ts` — 工具分发，FileService 的安全代理
> `packages/server/__tests__/teacherTools.test.ts`

| # | EARS | 状态 |
|---|------|------|
| U1 | `read_file` and `write_file` tool definitions shall have correct parameter schemas matching `inputSchema` in `llm.ts` | ✅ |
| E1 | When `executeToolCall` is called with `write_file` (no line numbers), it shall create the file via FileService | ✅ |
| E2 | When `executeToolCall` is called with `write_file` (with line numbers), it shall modify only specified lines | ✅ |
| E3 | When `executeToolCall` is called with `read_file`, it shall return file content via FileService | ✅ |
| X1 | If the path is outside the session directory, then `executeToolCall` shall return `{ success: false }` | ✅ |
| X2 | If an unknown tool name is provided, then `executeToolCall` shall return an error | ✅ |

---

### 5. 系统提示词解析 `[✅ 3 tests]`

> `services/llm.ts:resolveSystemPrompt` — 自定义 prompt 优先，fallback 到内置默认
> 测试在 `packages/server/__tests__/routes.test.ts`

| # | EARS | 状态 |
|---|------|------|
| E1 | When `system-prompt.md` exists with content, `resolveSystemPrompt` shall return the custom content | ✅ |
| E2 | When `system-prompt.md` does not exist, `resolveSystemPrompt` shall return the built-in default | ✅ |
| X1 | If `system-prompt.md` is empty or whitespace-only, then `resolveSystemPrompt` shall fall back to the built-in default | ✅ |

---

### 6. 数据存储 `[todo]`

> `db/index.ts` — Store class，JSON 文件持久化 Session 和 Message
> 建议测试文件：`packages/server/__tests__/store.test.ts`

| # | EARS | 状态 |
|---|------|------|
| U1 | The Store shall create the data directory on construction if it does not exist | todo |
| E1 | When `createSession` is called, the Store shall persist the session to `sessions.json` and create the session subdirectory | todo |
| E2 | When `getSessions` is called, the Store shall return all persisted sessions | todo |
| E3 | When `getSession(id)` is called, the Store shall return the matching session | todo |
| E4 | When `addMessage` is called, the Store shall append the message to `{sessionId}/messages.json` | todo |
| E5 | When `getMessages(sessionId)` is called, the Store shall return all messages for that session | todo |
| X1 | If `sessions.json` does not exist, then `getSessions` shall return `[]` | todo |
| X2 | If `messages.json` does not exist, then `getMessages` shall return `[]` | todo |
| X3 | If `getSession` is called with a non-existent ID, then it shall return `undefined` | todo |

---

### 7. Session 生命周期 `[todo]`

> `routes/session.ts` CRUD 部分 — 创建、查询、列表
> 建议测试文件：`packages/server/__tests__/sessionRoutes.test.ts`

| # | EARS | 状态 |
|---|------|------|
| E1 | When `POST /api/session` is called with `{ concept }`, the route shall create a session with UUID, persist it, and return the session object | todo |
| E2 | When `GET /api/session` is called, the route shall return all sessions | todo |
| E3 | When `GET /api/session/:id` is called with a valid ID, the route shall return `{ session, messages }` | todo |
| X1 | If `POST /api/session` is called without `concept` or with non-string `concept`, then the route shall return 400 | todo |
| X2 | If `GET /api/session/:id` is called with a non-existent ID, then the route shall return 404 | todo |

---

### 8. SSE 聊天流 ★ `[todo]`

> `routes/session.ts:57-213` — `POST /:id/chat`，核心数据通道，**零覆盖**
> 建议测试文件：`packages/server/__tests__/chatSSE.test.ts`
> 需 mock `streamTeacherResponse` 以控制 LLM 输出

这是整个系统的脊柱：用户消息 → 引用解析 → LLM 流式响应 → 工具调用 → 文件变更 → SSE 事件。

#### 请求验证

| # | EARS | 状态 |
|---|------|------|
| X1 | If the session does not exist, then the chat route shall return 404 (not start SSE) | todo |
| X2 | If `message` is missing or not a string, then the chat route shall return 400 | todo |

#### 引用解析

| # | EARS | 状态 |
|---|------|------|
| E1 | When the message contains `[file:start:end]` inline references, the route shall read referenced files via FileService and append their content to `userContent` | todo |
| E2 | When the request body contains explicit `references[]` with `content`, the route shall append them to `userContent` | todo |
| E3 | When both inline and explicit references exist, the route shall merge them into a single `allRefs` array on the saved user message | todo |
| X3 | If an inline-referenced file does not exist, then the route shall skip it silently (not fail the request) | todo |

#### 消息持久化

| # | EARS | 状态 |
|---|------|------|
| E4 | When a chat request is received, the route shall save the user message (with original text, not resolved content) via `store.addMessage` | todo |
| E5 | When the LLM stream completes with text content or tool events, the route shall save an assistant message with `{ content, toolEvents, parts }` | todo |
| X4 | If the LLM response has no text and no tool events, then the route shall not save an assistant message | todo |

#### LLM 未配置

| # | EARS | 状态 |
|---|------|------|
| E6 | When LLM is not configured (`model === null`), the route shall send a Chinese error text-delta and a done event via SSE, then end | todo |

#### 流式事件转发

| # | EARS | 状态 |
|---|------|------|
| S1 | While the LLM emits `text-delta` parts, the route shall forward each as an SSE `text-delta` event | todo |
| S2 | While the LLM emits `tool-call` parts, the route shall forward each as an SSE `tool-call` event with `toolName` and `args` | todo |
| S3 | While the LLM emits `tool-result` parts, the route shall forward each as an SSE `tool-result` event with `toolName` and `result` | todo |
| E7 | When the LLM emits a `reasoning-delta` part, the route shall skip it (not forward to client) | todo |
| U1 | The SSE response shall set `Content-Type: text/event-stream` and end with a `done` event | todo |

#### Part 累积逻辑

> `session.ts:159-190` — 连续 `text-delta` 合并为一个 text part，`tool-call`/`tool-result` 打断合并

| # | EARS | 状态 |
|---|------|------|
| S4 | While consecutive `text-delta` events arrive, the route shall merge them into a single `{ type: 'text' }` part in the parts array | todo |
| E8 | When a `tool-call` event arrives after text, the route shall start a new part (breaking the current text merge) | todo |
| E9 | When a `tool-result` event arrives, the route shall start a new part (breaking the current text merge) | todo |

#### 错误处理

| # | EARS | 状态 |
|---|------|------|
| X5 | If the LLM throws during streaming, then the route shall send an SSE `error` event with the error message and end | todo |

---

### 9. 设置与文件路由 `[✅ 8 + todo]`

> `routes/files.ts` — 文件 CRUD、Profile、System Prompt、LLM Status
> 已有测试在 `packages/server/__tests__/routes.test.ts`
> 补充测试建议加入同一文件

#### System Prompt `[✅ 3]`

| # | EARS | 状态 |
|---|------|------|
| E1 | When `GET /api/system-prompt` is called and file exists, the route shall return `{ content, totalLines, defaultContent }` | ✅ |
| E2 | When `GET /api/system-prompt` is called and file is absent, the route shall return `{ content: '', totalLines: 0, defaultContent }` | ✅ |
| E3 | When `PUT /api/system-prompt` is called with `{ content }`, the route shall write the file and return `{ success: true }` | ✅ |

#### LLM Status `[✅ 2]`

| # | EARS | 状态 |
|---|------|------|
| E4 | When `GET /api/llm-status` is called and `apiKey` is set, the route shall return `{ configured: true, provider, model, baseURL }` | ✅ |
| E5 | When `GET /api/llm-status` is called and `apiKey` is empty, the route shall return `{ configured: false, ... }` | ✅ |
| U1 | The `llm-status` response shall never include `apiKey` | ✅ (implicit) |

#### Milestones `[✅ 3]`

| # | EARS | 状态 |
|---|------|------|
| E6 | When `GET /session/:id/milestones` is called and `milestones.md` exists, the route shall return `{ total, completed }` | ✅ |
| E7 | When `GET /session/:id/milestones` is called and `milestones.md` is absent, the route shall return `{ total: 0, completed: 0 }` | ✅ |
| X1 | If the session does not exist, then the milestones route shall return 404 | ✅ |

#### Profile `[todo]`

| # | EARS | 状态 |
|---|------|------|
| E8 | When `GET /api/profile` is called and `profile.md` exists, the route shall return `{ content, totalLines }` | todo |
| E9 | When `GET /api/profile` is called and `profile.md` is absent, the route shall return `{ content: '', totalLines: 0 }` | todo |
| E10 | When `PUT /api/profile` is called with `{ content }`, the route shall write `profile.md` and return `{ success: true }` | todo |

#### File CRUD `[todo]`

| # | EARS | 状态 |
|---|------|------|
| E11 | When `GET /:sessionId/files` is called, the route shall return all files recursively, excluding `messages.json` and dotfiles | todo |
| E12 | When `GET /:sessionId/file?path=` is called, the route shall return `{ content, totalLines }` | todo |
| E13 | When `PUT /:sessionId/file` is called with `{ path, content }`, the route shall write the file | todo |
| E14 | When `DELETE /:sessionId/file?path=` is called, the route shall remove the file | todo |
| X2 | If `GET /:sessionId/files` targets a non-existent directory, then it shall return 404 | todo |
| X3 | If `GET /:sessionId/file` is called without `path` param, then it shall return 400 | todo |
| X4 | If `DELETE` targets a non-existent file, then it shall return 404 | todo |

---

## Client

---

### 10. SSE 流解析 `[todo]`

> `api/client.ts:152-191` — `streamChat` 手动解析 SSE（非 EventSource API）
> 建议测试文件：`packages/client/__tests__/streamChat.test.ts`

这是客户端唯一有复杂逻辑的 API 函数。其余 REST 函数都是 `fetch` → `.json()` 的直通管道，不值得单独测试。

| # | EARS | 状态 |
|---|------|------|
| E1 | When `streamChat` is called, it shall POST to `/api/session/:id/chat` and return an `AbortController` | todo |
| E2 | When SSE `data: {...}` lines arrive, the client shall JSON-parse each and invoke `onEvent` with the parsed object | todo |
| E3 | When data arrives in partial chunks across `reader.read()` calls, the client shall buffer incomplete lines and only parse complete ones | todo |
| E4 | When multiple `data:` lines arrive in a single chunk, the client shall parse and dispatch each event separately | todo |
| X1 | If a `data:` line contains invalid JSON, then the client shall skip it without throwing | todo |
| X2 | If the stream is aborted via `AbortController`, then the client shall stop reading without unhandled errors | todo |

---

### 11. 会话状态机 ★ `[todo]`

> `hooks/useSession.ts` — 客户端核心状态管理
> 建议测试文件：`packages/client/__tests__/useSession.test.ts`

客户端最有价值的测试目标。这个 hook 是整个前端的"中枢神经"——管理 session 生命周期、消息流、文件列表、SSE 流式状态。

#### 不变量

| # | EARS | 状态 |
|---|------|------|
| U1 | The hook shall expose `{ session, messages, files, streaming, streamingParts, startSession, loadSession, send, clearSession, stopStreaming, refreshFiles }` | todo |
| U2 | `refreshFiles` shall filter out `messages.json` from the returned file list | todo |

#### 创建会话

| # | EARS | 状态 |
|---|------|------|
| E1 | When `startSession(concept)` is called, the hook shall create a session via `api.createSession`, update `session` state, and send the first message with `我想学习：${concept}` prefix | todo |
| E2 | When `startSession` succeeds, the hook shall clear `messages` and `files` before starting | todo |

#### 加载会话

| # | EARS | 状态 |
|---|------|------|
| E3 | When `loadSession(id)` is called, the hook shall fetch session data via `api.getSession`, set `session` and `messages`, and refresh the file list | todo |

#### 发送消息

| # | EARS | 状态 |
|---|------|------|
| E4 | When `send(message, refs)` is called, the hook shall set `streaming=true`, optimistically add a user `ChatMessage` to `messages`, and open SSE via `api.streamChat` | todo |

#### SSE 事件处理

> `useSession.ts:44-83` — 与 `session.ts:161-190` 的 part 累积逻辑镜像

| # | EARS | 状态 |
|---|------|------|
| E5 | When a `text-delta` event arrives, the hook shall accumulate text and update `streamingParts`（连续 text-delta 合并为一个 text part） | todo |
| E6 | When a `tool-call` event arrives, the hook shall add a tool-call part to `streamingParts` and break the current text merge | todo |
| E7 | When a `tool-result` event arrives, the hook shall add a tool-result part to `streamingParts` and call `refreshFiles` | todo |
| E8 | When a `done` event arrives, the hook shall construct an assistant `ChatMessage` (with parts), append it to `messages`, clear `streamingParts`, and set `streaming=false` | todo |
| E9 | When a `done` event arrives, the hook shall refresh the file list | todo |

#### 停止与清除

| # | EARS | 状态 |
|---|------|------|
| E10 | When `stopStreaming` is called, the hook shall abort the SSE connection (`abortRef.current.abort()`) and set `streaming=false`, clear `streamingParts` | todo |
| E11 | When `clearSession` is called, the hook shall abort any active stream and reset all state (`session=null, messages=[], files=[], streaming=false, streamingParts=[]`) | todo |

#### 防护

| # | EARS | 状态 |
|---|------|------|
| X1 | If `send` is called when `session` is null, then the hook shall no-op | todo |
| X2 | If an SSE `error` event arrives, then the hook shall set `streaming=false` and clear `streamingParts` without corrupting `messages` | todo |
| X3 | If the `done` event arrives but `fullText` is empty and `parts` is empty, then the hook shall not add an assistant message | todo |

---

## Future

> 以下功能尚未实现。测试声明作为架构愿景的占位，在实现时同步补充细节。

---

### Context Assembler `[future]`

> `services/contextAssembler.ts` — 用户可见的上下文选择中间层，项目核心差异化

| # | EARS |
|---|------|
| U1 | The assembler shall always include the resolved system prompt (global + session) regardless of user selection |
| U2 | The assembler output shall be deterministic: same config + same files = same result |
| E1 | When a context config selects specific profile blocks, the assembler shall include only those blocks |
| E2 | When a context config selects file segments, the assembler shall read and include those line ranges |
| E3 | When `GET /api/session/:id/context-preview` is called, the route shall return the full assembled context |
| E4 | When no context config exists, the assembler shall use sensible defaults |
| X1 | If a referenced file in the config no longer exists, then the assembler shall skip it |

---

### Session 级教学指令 `[future]`

> `data/{sessionId}/session-prompt.md` — 追加到全局 prompt，不替换

| # | EARS |
|---|------|
| E1 | When `session-prompt.md` exists in the session directory, `resolveSystemPrompt(dataDir, sessionId)` shall append its content to the global prompt |
| X1 | If `session-prompt.md` is corrupted or unreadable, then the function shall use only the global prompt |

---

### 标题摘要 `[future]`

> 首次发消息时并行触发轻量 LLM 调用生成短标题

| # | EARS |
|---|------|
| E1 | When the first user message is sent, the server shall trigger a parallel LLM call to generate a 3-5 character title |
| E2 | When the title generation completes, the server shall update `Session.concept` via `store.updateSession()` |
| X1 | If the title LLM call fails, then `Session.concept` shall remain unchanged |

---

## 测试基础设施

### Server（已就绪）

| 工具 | 用途 |
|------|------|
| vitest | 测试运行器 |
| supertest | HTTP 集成测试 |
| `mkdtemp` 临时目录 | 文件系统 fixture 隔离 |

### Client（需搭建）

| 工具 | 用途 |
|------|------|
| vitest + jsdom | 复用 monorepo vitest 配置，加 jsdom 环境 |
| `vi.fn()` / `vi.mock()` | Mock `api/client.ts` 模块，控制 SSE 事件序列 |

> **注意**：不需要 `@testing-library/react` 或 `msw`。
> - `useSession` 可通过 `renderHook`（从 React 18+ 的 `react-dom/test-utils` 或轻量 wrapper）测试
> - `streamChat` 是纯函数，mock `fetch` 即可
> - 我们不测 React 组件渲染

---

## 统计与优先级

### 覆盖现状

| 域 | 已有 | 待补 | 合计 |
|----|------|------|------|
| 1. 沙箱文件系统 | 22 | — | 22 |
| 2. 引用解析 | 8 | — | 8 |
| 3. 里程碑解析 | 8 | — | 8 |
| 4. 工具执行层 | 7 | — | 7 |
| 5. 系统提示词 | 3 | — | 3 |
| 6. 数据存储 | — | 9 | 9 |
| 7. Session 生命周期 | — | 5 | 5 |
| **8. SSE 聊天流 ★** | **—** | **20** | **20** |
| 9. 设置与文件路由 | 8 | 10 | 18 |
| 10. SSE 流解析 | — | 6 | 6 |
| **11. 会话状态机 ★** | **—** | **16** | **16** |
| **合计** | **56** | **66** | **122** |

### 实施优先级

```
P0 — 系统脊柱（最高价值，零覆盖）
  ★ 8. SSE 聊天流     (20 tests)  ← 整个系统的核心数据通道
  ★ 11. 会话状态机     (16 tests)  ← 客户端中枢

P1 — 数据层
  6. 数据存储          (9 tests)   ← 持久化契约
  7. Session 生命周期   (5 tests)   ← API 入口

P2 — 补全
  10. SSE 流解析        (6 tests)   ← 客户端唯一有复杂逻辑的 API 函数
  9. 设置与文件路由     (10 tests)  ← Profile + File CRUD 补全

P3 — 随功能实现
  Context Assembler / Session 指令 / 标题摘要
```
