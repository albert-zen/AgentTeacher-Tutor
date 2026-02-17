# Test Specification (EARS)

> **EARS** = Easy Approach to Requirements Specification
> 每条声明直接映射为一个 `it('...')` 测试用例。
> `[✅ N tests]` = 已有测试覆盖 · `[current]` = 待补 · `[future]` = 随架构演进实现

---

## Server

### S1. FileService — 沙箱文件 I/O `[✅ 22 tests]`

> `packages/server/__tests__/fileService.test.ts`

**已覆盖：** 全文件读写、行范围读写、路径遍历防护、自动建目录、尾换行处理、边界行号校验。

**待补：**
- X1 `[current]` If the file path contains null bytes or OS-reserved names, then FileService shall reject the operation
- E1 `[future]` When reading a binary file (image), FileService shall return raw buffer or error (视觉输入支持前置)

---

### S2. Reference Parser `[✅ 8 tests]`

> `packages/server/__tests__/referenceParser.test.ts`

**已覆盖：** 完整引用、仅文件名、多引用提取、非法格式、子目录路径、空输入、引用生成。

**待补：**
- E1 `[future]` When parsing `[session:id/file:start:end]`, the parser shall recognize cross-session references

---

### S3. Milestones Parser `[✅ 8 tests]`

> `packages/server/__tests__/milestonesParser.test.ts`

**已覆盖：** 标题解析、完成/未完成、空文件、大写 X、非 checkbox 行跳过、序列化、round-trip。

**状态：完整覆盖，无需补充。**

---

### S4. Teacher Tools `[✅ 7 tests]`

> `packages/server/__tests__/teacherTools.test.ts`

**已覆盖：** 工具 schema 定义、read/write 执行、路径安全防护、未知工具错误。

**待补：**
- E1 `[future]` When `web_search` tool is called, it shall return search results within rate limits
- E2 `[future]` When `fetch_url` tool is called, it shall return markdown-converted content

---

### S5. Routes — Settings `[✅ 8 tests]`

> `packages/server/__tests__/routes.test.ts`

**已覆盖：** system-prompt GET/PUT、llm-status 配置/未配置、milestones 有/无/404、resolveSystemPrompt 三分支。

**待补：**
- E1 `[current]` When `GET /api/profile` is called with no profile.md, the route shall return empty content
- E2 `[current]` When `PUT /api/profile` is called, the route shall save and return success

---

### S6. Routes — Session CRUD `[✅ 3 tests (间接)]`

> Session 创建在 milestones 测试中间接覆盖，无独立测试。

#### Ubiquitous
- U1 `[current]` The session list endpoint shall return all sessions ordered by creation time

#### Event-driven
- E1 `[current]` When `POST /api/session` is called with `{ concept }`, the route shall create a session with UUID and return it
- E2 `[current]` When `GET /api/session/:id` is called, the route shall return the session and its messages
- E3 `[current]` When `POST /api/session` is called without concept, the route shall return 400
- E4 `[current]` When `GET /api/session/:id` is called with invalid ID, the route shall return 404

---

### S7. Routes — Chat SSE

> 核心端点，目前零直接测试。需 mock LLM 响应。

#### Event-driven
- E1 `[current]` When `POST /api/session/:id/chat` is called with a message, the route shall save the user message and begin SSE streaming
- E2 `[current]` When the message contains `[file:start:end]` references, the route shall resolve them via FileService and append to user content
- E3 `[current]` When explicit references are provided in the body, the route shall merge them with inline references
- E4 `[current]` When LLM is not configured, the route shall return a Chinese error message via SSE and end

#### State-driven
- S1 `[current]` While LLM is streaming, the route shall forward `text-delta`, `tool-call`, `tool-result` events as SSE
- S2 `[current]` While tool calls are happening, the route shall accumulate ordered `MessagePart[]` for the assistant message

#### Unwanted
- X1 `[current]` If the LLM throws during streaming, then the route shall send an SSE error event and end the response
- X2 `[current]` If the session does not exist, then the route shall return 404 (not start SSE)

---

### S8. resolveSystemPrompt `[✅ 3 tests]`

**已覆盖：** 无文件→默认、有文件→自定义、空文件→默认。

**待补：**
- E1 `[future]` When `resolveSystemPrompt(dataDir, sessionId)` is called with a session that has `session-prompt.md`, the function shall append its content to the global prompt
- X1 `[future]` If `session-prompt.md` is corrupted, then the function shall use only the global prompt without crashing

---

### S9. Context Assembler `[future]`

> `services/contextAssembler.ts` — 核心架构组件

#### Ubiquitous
- U1 `[future]` The assembler shall always include the resolved system prompt (global + session) regardless of user selection
- U2 `[future]` The assembler output shall be deterministic: same config + same files = same result

#### Event-driven
- E1 `[future]` When a context config selects specific profile blocks, the assembler shall include only those blocks
- E2 `[future]` When a context config selects file segments, the assembler shall read and include those line ranges
- E3 `[future]` When `GET /api/session/:id/context-preview` is called, the route shall return the full assembled context
- E4 `[future]` When no context config exists, the assembler shall use sensible defaults (full profile, system prompt only)

#### Unwanted
- X1 `[future]` If a referenced file in the config no longer exists, then the assembler shall skip it and continue
- X2 `[future]` If the assembled context exceeds a token limit, then the assembler shall warn (not silently truncate)

---

### S10. Title Summary `[future]`

- E1 `[future]` When the first user message is sent, the server shall trigger a parallel LLM call to generate a 3-5 character title
- E2 `[future]` When the title LLM call completes, the server shall update `Session.concept` via `store.updateSession()`
- X1 `[future]` If the title LLM call fails, then the session concept shall remain as the original user input

---

## Client

### C1. useSession Hook

> 核心状态机：null → session → streaming → done。零测试。

#### Ubiquitous
- U1 `[current]` The hook shall expose `{ session, messages, files, streaming, streamingParts }`
- U2 `[current]` The hook shall never have `streaming === true` when `session === null`
- U3 `[current]` The hook shall reset all state when `clearSession` is called

#### Event-driven
- E1 `[current]` When `startSession(text)` is called, the hook shall create a session via API and send the text as the first message
- E2 `[current]` When `loadSession(id)` is called, the hook shall fetch session data and populate messages and files
- E3 `[current]` When `send(message, refs)` is called, the hook shall optimistically add a user message and begin SSE streaming
- E4 `[current]` When a `tool-result` SSE event arrives, the hook shall refresh the file list
- E5 `[current]` When a `done` SSE event arrives, the hook shall save the assistant message and set streaming to false
- E6 `[current]` When `stopStreaming` is called, the hook shall abort the SSE connection and reset streaming state

#### Unwanted
- X1 `[current]` If `send` is called with no active session, then the hook shall no-op
- X2 `[current]` If the SSE stream emits an `error` event, then the hook shall stop streaming without corrupting state
- X3 `[current]` If `startSession` API call fails, then the hook shall not update session state

---

### C2. API Client

#### Event-driven
- E1 `[current]` When `createSession(concept)` is called, the client shall POST and return the session object
- E2 `[current]` When `streamChat` is called, the client shall open SSE and invoke callback for each parsed event
- E3 `[current]` When `getSystemPrompt()` is called, the client shall return `{ content, totalLines, defaultContent }`
- E4 `[future]` When `getContextPreview(sessionId)` is called, the client shall return the assembled context

#### Unwanted
- X1 `[current]` If a REST call returns non-OK status, then the client shall throw with the error message
- X2 `[current]` If SSE is aborted via AbortController, then the client shall clean up without throwing

---

### C3. App.tsx — Page Router

#### State-driven
- S1 `[current]` While no session is active, App shall render Landing Page
- S2 `[current]` While a session is active, App shall render Workspace

#### Event-driven
- E1 `[current]` When a session is started from Landing Page, App shall transition to Workspace
- E2 `[current]` When "← Sessions" is clicked, App shall clear session and return to Landing Page
- E3 `[current]` When files refresh (tool-result), App shall reload the active file content

---

### C4. Landing Page

#### Event-driven
- E1 `[current]` When user submits non-empty input, the page shall call `onStart` with trimmed text
- E2 `[current]` When user presses Enter, the page shall submit
- E3 `[current]` When user clicks a session, the page shall call `onLoadSession`
- E4 `[current]` When user clicks a settings card, the corresponding modal shall open

#### State-driven
- S1 `[current]` While input is empty, the submit button shall be disabled
- S2 `[current]` While no sessions exist, the "继续学习" card shall not render

---

### C5. ChatPanel

#### Event-driven
- E1 `[current]` When user sends a message, the panel shall call `onSend` with text and attachments
- E2 `[current]` When user pastes matching copy source, the panel shall create a file-ref attachment
- E3 `[current]` When user presses Backspace in empty input, the panel shall remove the last attachment
- E4 `[future]` When user scrolls up manually, the panel shall stop auto-scrolling
- E5 `[future]` When user scrolls back to bottom, the panel shall resume auto-scrolling

#### State-driven
- S1 `[current]` While streaming, the panel shall show partial message and a stop button
- S2 `[current]` While not streaming with empty input, send button shall be visually disabled
- S3 `[future]` While user has scrolled up, the panel shall show a "↓ 新消息" floating button

#### Unwanted
- X1 `[current]` If send is called with empty text and no attachments, then onSend shall not be invoked

---

### C6. Session Sidebar

#### Event-driven
- E1 `[current]` When user types in search, sidebar shall filter sessions case-insensitively
- E2 `[current]` When collapse button is clicked, sidebar shall toggle and persist to localStorage

#### State-driven
- S1 `[current]` While collapsed, sidebar shall show only the expand chevron (w-10)
- S2 `[current]` While expanded, sidebar shall show search + session list (w-52)

---

### C7. FileTree + MarkdownEditor

#### Event-driven
- E1 `[current]` When a file is clicked, FileTree shall call `onSelect`
- E2 `[current]` When edit mode is toggled, MarkdownEditor shall switch between preview and textarea
- E3 `[current]` When user saves in edit mode, editor shall call `onSave`
- E4 `[future]` When a code block has a language tag, the editor shall render syntax-highlighted code

#### State-driven
- S1 `[current]` While in preview mode, markdown shall render with GFM tables

---

### C8. MilestoneBar

- U1 `[current]` The bar shall parse `- [x]` as completed and `- [ ]` as pending
- S1 `[future]` While collapsed, the bar shall show compact progress bar
- S2 `[future]` While expanded, the bar shall show full pill list

---

### C9. Modals

- E1 `[current]` When Profile modal opens, it shall fetch and display profile.md content
- E2 `[current]` When System Prompt modal opens, it shall show default prompt as placeholder
- E3 `[current]` When Escape or backdrop is clicked, the modal shall close
- S1 `[current]` While LLM is configured, LLM modal shall show green status dot

---

### C10. Context Assembler UI `[future]`

#### Ubiquitous
- U1 `[future]` The context panel shall display all sources grouped by type (profile, prompt, files)

#### Event-driven
- E1 `[future]` When a context block is toggled, selection shall persist to session config
- E2 `[future]` When "预览上下文" is clicked, the assembled context shall be fetched and displayed

#### State-driven
- S1 `[future]` While no explicit selection exists, the assembler shall use defaults
- S2 `[future]` While preview is open, selection changes shall live-update the preview

---

## Test Infrastructure

### Server (已有)

```
vitest                — 测试运行器
supertest             — HTTP 集成测试
临时目录 (mkdtemp)     — 隔离的文件系统 fixtures
```

### Client (待建)

```
vitest + jsdom              — 复用 monorepo vitest，加 jsdom 环境
@testing-library/react      — 组件渲染 + 查询
@testing-library/user-event — 真实用户交互模拟
msw (Mock Service Worker)   — API mock（拦截 fetch，不 mock 实现）
```

---

## Test Priority

```
Phase 1 — 核心逻辑（高价值，低依赖）
  Server:
    ✦ S6  Session CRUD routes (4 tests)
    ✦ S7  Chat SSE route (8 tests)      ← 核心端点，零覆盖
  Client:
    ✦ C1  useSession hook (12 tests)     ← 状态机，最高价值
    ✦ C2  API client (6 tests)

Phase 2 — 交互覆盖
  Client:
    ✦ C3  App.tsx router (5 tests)
    ✦ C4  Landing Page (6 tests)
    ✦ C5  ChatPanel (9 tests)            ← 最复杂的交互组件
    ✦ C6-C9  其余组件 (15 tests)
  Server:
    ✦ S5  补充 Profile routes (2 tests)

Phase 3 — 架构演进（随功能实现同步）
  Server:
    ✦ S9  Context Assembler (8 tests)    ← 核心差异化
    ✦ S10 Title Summary (3 tests)
    ✦ S8  Session-level prompt (2 tests)
  Client:
    ✦ C10 Context Assembler UI (5 tests)
    ✦ C5  Auto-scroll (E4-E5, S3)
    ✦ C7  Syntax highlighting (E4)
```

### Coverage Target

| Layer | Current | Phase 1 | Phase 2 | Phase 3 |
|-------|---------|---------|---------|---------|
| Server | 56 tests | +12 | +2 | +13 |
| Client | 0 tests | +18 | +35 | +8 |
| **Total** | **56** | **86** | **123** | **144** |
