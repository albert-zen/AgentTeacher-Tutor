# 待完成需求

## 已完成

- [x] 多附件 chips（文件引用 + 引用文本），显示在输入框上方
- [x] 智能粘贴：从编辑器复制 → 粘贴到聊天自动创建文件引用 chip
- [x] Backspace 删除最后一个 chip
- [x] 文件类型不限于 `.md`，支持任意扩展名
- [x] 工具调用事件在聊天中可视化（可展开查看参数/结果）
- [x] Session 切换（← Sessions 返回按钮）
- [x] P3: 所有文件允许编辑和删除
- [x] P4: Markdown GFM 表格渲染（remark-gfm）
- [x] P6: 发送按钮禁用态样式区分 + 停止按钮
- [x] P14: ESLint + Prettier 配置
- [x] Landing Page 重构：侧栏 + 仪表盘布局，Settings 模态框（Profile / System Prompt / LLM）

---

## Tier 1: 体验基础（直接影响日常使用）

### 面板自由拖拽调整大小

**现状：** 文件树 `w-52`、聊天面板 `w-96` 均为固定宽度，编辑器占剩余空间。里程碑栏高度由内容撑开。

**目标：** 文件树 | 编辑器 | 聊天面板三列之间可拖拽分割线调整宽度；里程碑栏与编辑器之间可拖拽调整高度。

**工程要点：**
- 实现通用 `ResizeHandle` 组件：监听 mousedown → mousemove → mouseup，计算偏移量
- 用 CSS `cursor: col-resize` / `row-resize` 提示拖拽方向
- 面板宽度存入 state（或 localStorage 持久化），替换固定 Tailwind class
- 设置 `min-width` / `max-width` 防止面板被拖到不可用尺寸
- 拖拽过程中需 `pointer-events: none` 覆盖层防止 iframe/selection 干扰

---

### 里程碑栏折叠 + 进度条

**现状：** MilestoneBar 始终展开显示所有里程碑 pill，无法收起。

**目标：** 可折叠。收起状态下显示紧凑进度条，格式如 `学习进度 ███░░░░ 3/10`。

**工程要点：**
- 添加 `collapsed` state + 切换按钮（chevron 图标）
- 收起态：单行，左侧标题，中间进度条（`<div>` 填充百分比），右侧 `completed/total`
- 展开态：保持当前 pill 列表布局
- 折叠状态可选持久化到 localStorage

---

### LLM Provider 可配置 + 运行时切换

**现状：** LLM 配置通过 `.env` 环境变量（`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`），修改需重启服务。

**目标：** 配置存储为文件（如 `data/llm-config.json`），支持运行时切换 provider 无需重启。

**工程要点：**
- 配置格式：`{ provider, baseUrl, apiKey, model, temperature, ... }`
- 服务端 `llm.ts`：按需读取配置文件创建 provider 实例，而非启动时固定绑定
- 客户端：新增设置页面或弹窗，编辑配置并写回（通过 API 端点）
- apiKey 安全：客户端仅显示掩码，写入时合并而非全量覆盖
- 可选支持多 provider profile 快速切换

---

### SSE 流中断恢复 + 消息重试

**现状：** SSE 流断开后无恢复机制，消息发送失败无重试 UI，用户只能刷新页面。

**目标：** 流式传输中断时自动重连或提示用户重试；发送失败的消息显示重试按钮。

**工程要点：**
- `useSession` 的 SSE 消费逻辑添加错误处理：网络断开 vs 服务端错误区分
- 失败消息在 UI 上标红 + 显示"重试"按钮，点击重新发送
- 可选：流中断后从最后一个 `text-delta` 断点续传（需服务端支持 event ID）
- 基础方案先做"重试整条消息"，断点续传作为进阶

---

### Writing 状态指示

**现状：** Agent 通过 `write_file` 写入后，客户端一次性刷新。大文件写入期间编辑器无反馈。

**目标：** Agent 写入当前打开文件时，编辑器展示 "Writing..." 状态指示；写入完成后刷新。

**工程要点：**
- 基础方案：`tool-call`（write_file 且目标 = activeFile）时在编辑器顶部显示状态条；`tool-result` 后移除并刷新
- 进阶方案：SSE 携带 write_file 内容片段，编辑器实时追加显示
- 进阶需改 `teacher.ts` 工具执行逻辑，将写入内容拆为流式 SSE

---

### 聊天自动滚动智能暂停

**现状：** `ChatPanel.tsx:208-210` 的 `useEffect` 在 `messages` 或 `streamingParts` 变化时无条件调用 `scrollIntoView({ behavior: 'smooth' })`。用户主动上滚查看历史消息时，新内容到达会强制拉回底部，打断阅读。

**目标：** Agent 输出时自动滚动到底部（当前行为），但用户主动上滚后停止自动滚动。用户滚回底部时恢复自动滚动。

**工程要点：**
- 监听消息容器的 `scroll` 事件，判断是否在底部附近（`scrollTop + clientHeight >= scrollHeight - threshold`）
- 用 `useRef` 维护 `isUserScrolledUp` 状态
- `useEffect` 中仅在 `!isUserScrolledUp` 时执行 `scrollIntoView`
- 可选：用户上滚时显示"↓ 新消息"浮动按钮，点击跳回底部

---

### 代码块语法高亮

**现状：** `MarkdownEditor.tsx` 和 `ChatPanel.tsx` 使用 `ReactMarkdown` + `remarkGfm` 渲染 Markdown，代码块（\`\`\`python 等）仅显示为等宽纯文本，无语法着色。

**目标：** 代码块按语言语法高亮渲染，提升 Teacher Agent 输出代码示例时的可读性。

**工程要点：**
- 方案 A：`react-syntax-highlighter` + `prism`/`hljs` 主题，通过 ReactMarkdown 的 `components={{ code }}` 自定义渲染
- 方案 B：`shiki`（更现代，主题丰富），但包体积较大
- 方案 A 更轻量，推荐优先
- 需同时应用到两个渲染点：`MarkdownEditor.tsx:74` 和 `ChatPanel.tsx:49/56`
- 可提取共享的 `<MarkdownRenderer>` 组件避免重复配置
- 主题选择：深色系（与 zinc-950 背景协调），如 `oneDark` 或 `vscDarkPlus`

---

### 自由对话式开始学习

**现状：** Landing Page 输入框 placeholder 为"输入你想学习的概念..."，要求用户输入精确概念名。`startSession(concept)` 将输入作为 session 标题（`Session.concept`），并自动拼接 `我想学习：${concept}` 作为首条消息发送（`useSession.ts:96`）。用户必须先明确自己要学什么才能开始。

**目标：** 用户可以用任意自由文本开始——"我刚看到量子纠缠的视频但不太理解"、"帮我搞懂 useEffect 清理函数"、"什么是 CAP 定理？"都能直接创建 session。输入体验更像对话而非表单。

**工程要点：**
- Placeholder 改为开放文案，如"描述你想学的、想问的..."
- `useSession.ts:96`：去掉 `我想学习：` 前缀，直接将用户原文作为首条消息
- `Session.concept` 语义变更：暂时存用户原始输入（配合"标题自动摘要"后续优化）
- Landing Page 输入框可改为 `<textarea>` 支持多行，Enter 发送 / Shift+Enter 换行
- `SessionSidebar` 需适配长标题显示（`truncate` + `title` tooltip）
- 服务端 `POST /api/session` 无需改动（`concept` 已接受任意字符串）

---

## Tier 2: 上下文编排（项目核心差异化）

### System Prompt 文件化 + 可编辑 `[完成]`

**现状：** Landing Page 已有 System Prompt 编辑模态框，可读写 `data/system-prompt.md`，默认提示词显示为 placeholder。`resolveSystemPrompt(dataDir)` 优先读取自定义文件，不存在或为空时 fallback 到内置默认。

**已完成：**
- ✅ 编辑模态框（UI 读写 system-prompt.md）
- ✅ 默认 prompt 作为 placeholder 显示
- ✅ LLM 调用时使用自定义 prompt（`resolveSystemPrompt` in `llm.ts`）

---

### Session 级教学指令（追加到 System Prompt）

**现状：** `resolveSystemPrompt(dataDir)` 解析全局 system prompt，所有 session 共用。无法针对特定学习主题或学生状态添加额外指令。

**目标：** 支持 session 级教学指令文件 `data/{sessionId}/session-prompt.md`。该内容**追加**到全局 system prompt 末尾（不替换），为当前 session 提供额外上下文（如"该学生有物理背景，多用公式推导"或"本 session 聚焦实践，少讲理论"）。

**工程要点：**
- `resolveSystemPrompt(dataDir, sessionId?)` 增加可选参数：先解析全局 prompt，再读取 `data/{sessionId}/session-prompt.md`，存在则追加（`\n\n## Session 指令\n${content}`）
- `session.ts` chat handler 传入 `session.id`
- 客户端：workspace header 中添加 "教学指令" 按钮，点击弹出编辑模态框（复用 `Modal.tsx`）
- API：复用现有 file 端点（`PUT /:sessionId/file` 写入 `session-prompt.md`），无需新增路由
- UI 上区分"全局 prompt（Settings 里编辑）"与"本 session 指令（workspace 里编辑）"

---

### Session 标题自动摘要

**现状：** `Session.concept` 直接使用用户输入文本作为 session 标题。当前因为要求输入精确概念名所以标题简短可辨识，但若改为自由输入（见 Tier 1"自由对话式开始学习"），session 列表会出现长标题难以区分。

**目标：** 自由输入开始 session 后，自动生成简洁标题摘要（如"我刚看到量子纠缠的视频但不太理解" → "量子纠缠"）。

**工程要点：**
- 用户首次发消息时触发两次并行 LLM 调用：一次正常 Teacher 响应，一次轻量标题生成（3-5 字摘要）
- 标题生成调用完成后更新 `Session.concept`（`Store` 需新增 `updateSession(id, patch)`）
- 客户端在 session 列表中截断显示作为 fallback（LLM 不可用时也能用）
- 标题生成 prompt 极简：`"用3-5个字概括这个学习需求：${userMessage}"`
- SSE 或轮询通知客户端标题已更新（或下次加载 session 列表时自然刷新）

---

### 上下文编排器 (Context Assembler)

**现状：** LLM 调用时的上下文组装散落在 `session.ts:67-98`（引用解析）和 `llm.ts:resolveSystemPrompt`（prompt 拼接），用户无法看到"模型实际会看到什么"，也无法选择哪些信息参与对话。一切皆文件的理念尚未体现为用户可操作的选择界面。

**目标：** 用户可见的上下文选择中间层。用户主动勾选哪些文件片段/块参与当前对话，Assembler 汇集选中内容传给 LLM。这是项目"上下文编排器"愿景的核心实现。

**可选择的上下文源（渐进扩展）：**
- 个人 Profile 的分块（按 `#` 标题切分，勾选子集）
- 全局 System Prompt 的分块
- Session 级教学指令
- 当前 session 的文件片段（`[file:startLine:endLine]`）
- 历史 session 的内容（跨 session 引用，远期）

**工程要点：**
- 服务端：`services/contextAssembler.ts`——纯函数，输入为 `sessionDir` + 用户选择配置，输出为 `{ systemPrompt, contextBlocks }`
- 选择配置存为 session 目录下的文件（如 `data/{sessionId}/context-config.json`），符合 everything-is-a-file
- 文件分块解析器：通用的按 `#` 标题 / 自定义标签分块，提取 `{ id, name, content, source }` 对象
- 客户端：上下文选择面板（workspace 侧边或抽屉），展示可用块 + 勾选状态
- API：`GET /api/session/:id/context-preview` 预览模型即将看到的完整上下文（调试用）
- 第一步：从 Profile 分块选择开始，验证整个链路，再扩展到其他源

---

### 用户 Profile 分块 + 选择性注入

**现状：** 有 `data/profile.md` 和基础的读写 API，但内容整体注入，无分块选择机制。

**目标：** Profile 文件按标题分块，用户可按需勾选哪些块传给模型。不同 session 可选择不同子集。作为 Context Assembler 的第一个实际数据源。

**文件格式示例：**
```markdown
# 基本信息
25岁，计算机专业研究生

# 学习目标
深入理解分布式系统原理，准备面试

# 已有基础
熟悉 Go 和 Python，了解 CAP 定理基础概念

# 偏好
喜欢通过实际例子和类比学习，不喜欢纯理论推导
```

**工程要点：**
- 解析器：按 `# 标题` 分块，每块提取为 `{ name, content }` 对象
- 服务端：读取 profile 文件 → 解析分块 → 注入 system prompt（全部或用户选择的子集）
- 客户端：Profile 编辑页面 + 块选择 UI（勾选哪些块本次生效）
- API：`GET /api/profile/blocks` 返回解析后的块列表
- 块选择状态存为 session 级别配置
- 当前已有 `getProfile` / `updateProfile` API 端点，可复用扩展

---

### 多行选中 → 文件引用（行号精确映射）

**现状：** `content.indexOf(selectedText)` 匹配原文行号，多行或含格式的选中文本无法匹配（渲染文本 ≠ 源码）。

**目标：** 选中编辑器中任意多行内容，"Add to Chat" 后正确识别源文件行号范围。

**工程要点：**
- 自定义 ReactMarkdown renderer，注入 `data-source-line` 属性
- 从 DOM Selection 的 anchorNode/focusNode 读取行号反推范围
- 智能粘贴路径不受影响，已可处理多行

---

## Tier 3: Agent 能力扩展

### Teacher Agent 互联网搜索工具

**现状：** Teacher Agent 仅依赖 LLM 内置知识，无法获取最新信息或前沿知识。

**目标：** Agent 具备联网搜索能力，可检索最新论文、技术文档、新闻等，将搜索结果纳入教学内容。

**工程要点：**
- 新增 `web_search` 工具定义（Zod schema），加入 `buildTools()` 工具集
- 搜索后端：调用搜索 API（Google Custom Search / Bing / SearXNG 自建）
- 结果处理：搜索结果摘要提取 → 传回 LLM 作为上下文
- 可选 `fetch_url` 工具：抓取指定 URL 内容（带 HTML→markdown 转换）
- system prompt 增加搜索使用指引：何时搜索、如何引用来源
- 速率限制和缓存：防止 Agent 过度搜索
- 搜索结果可写入 session 文件（如 `references/`），成为可编辑的上下文文件

---

### 视觉输入支持

**现状：** 聊天输入仅支持文本和文件引用。用户无法发送图片给 Teacher Agent（如拍照的板书、截图的公式、论文中的图表）。

**目标：** 用户可以在聊天中上传或粘贴图片，Teacher Agent 能"看到"图片内容并基于此进行教学。

**工程要点：**
- 依赖 LLM 的多模态能力（需模型支持 vision，如 GPT-4o、Qwen-VL 等）
- 客户端：ChatPanel 输入区支持图片上传（拖拽 / 粘贴 / 文件选择器）
- 图片存储：保存到 `data/{sessionId}/images/` 目录，符合 everything-is-a-file
- 服务端：消息格式从纯文本扩展为多模态（`content: [{ type: 'text', text }, { type: 'image', url }]`）
- Vercel AI SDK 的 `streamText` 已支持多模态 messages，需调整 `llmMessages` 构建逻辑
- Attachments 体系扩展：新增 `type: 'image'` attachment 类型
- 预览：聊天消息中内联显示图片缩略图

---

### 多 Session 间共享文件 / 跨 Session 引用

**现状：** 每个 session 的文件完全隔离，学习同一大主题的多个 session 无法复用已有材料。

**目标：** 支持跨 session 引用文件，或维护一个全局共享文件区。

**工程要点：**
- 方案 A：全局文件区 `data/shared/`，所有 session 可读写，文件树中单独展示
- 方案 B：引用协议扩展 `[session:sessionId/file:start:end]`，可引用其他 session 的文件（只读）
- 方案 A 更简单实用，优先考虑
- FileService 需支持多根目录（session 目录 + shared 目录）
- 文件树 UI 分组显示：Session 文件 / 共享文件

---

### 导出功能

**现状：** 学习材料只能在应用内查看，无法导出复习或分享。

**目标：** 将一个 session 的学习材料导出为完整文档（合并 markdown / PDF）。

**工程要点：**
- 基础方案：将 session 内所有 `.md` 文件按顺序合并为单个 markdown 文件下载
- 进阶方案：服务端使用 `markdown-pdf` 或 `puppeteer` 生成 PDF
- 可选包含聊天记录摘要（Agent 对话中的关键知识点提取）
- API：`GET /api/session/:id/export?format=md|pdf`
- 客户端：Session 详情页或 Header 添加导出按钮

---

## Tier 4: 交互进阶（工作量大，当前方案够用）

### 内联引用 chips

**现状：** chips 集中出现在 textarea 上方，与文本输入分离。

**目标：** 像 Cursor 一样，引用 chip 与普通文字混排在同一个输入区域内。

**工程要点：**
- `<textarea>` 无法渲染 HTML 节点，需替换为 `contentEditable` 或富文本编辑器库
- 候选方案：TipTap（ProseMirror）、Slate.js
- 需处理：光标定位、chip 插入/删除/键盘导航、内容序列化（chip → `[file:start:end]`）
- ChatPanel 输入区域重写 + 新增依赖

---

### 聊天历史文件化 + Fork

**理念：** "Everything is a file"——聊天记录是可编辑文件，非只读消息流。

**目标：**
- 聊天历史以文件形式存储（`chat.md` 或 `conversation.jsonl`），可在编辑器中编辑
- 支持 fork：从某条消息分叉出新对话分支
- 支持复制：将一段对话复制为独立笔记文件
- 引用指向文件行号，编辑后仍能定位（或标记 stale）

**工程要点：**
- 设计序列化格式（兼顾可读性和机器解析）
- fork/branch 模型：树状对话结构 vs 扁平文件复制
- 引用稳定性：文件修改后行号偏移处理
- `messages.json` 迁移或兼容
- 复杂度高，建议等核心功能稳定后再做

---

## Tier 5: 平台化（功能稳定后再考虑）

### Electron 桌面应用 + 移动端

**现状：** 纯 Web 应用，Vite dev server + Express 后端，浏览器访问。

**目标：** 打包为 Electron 桌面应用（Windows/macOS/Linux）；后续支持移动端（iOS/Android）。

**工程要点 — Electron：**
- 新增 `packages/desktop` 包，使用 `electron-builder` 或 `electron-forge`
- Main process 启动 Express server（内嵌），Renderer 加载 Vite 构建产物
- 文件存储路径改为 `app.getPath('userData')`，替代项目目录下的 `data/`
- 窗口管理：记住尺寸位置、系统托盘、原生菜单栏
- 自动更新：`electron-updater` + GitHub Releases
- 开发时：Vite dev server + Electron 热重载（`electron-vite` 或 `concurrently`）

**工程要点 — 移动端：**
- 候选方案：React Native（复用 React 知识）、Capacitor（复用 Web 代码）、Tauri Mobile（Rust，轻量）
- Capacitor 方案最简：将现有 Web 构建产物直接包装为原生 App，改动最小
- 移动端适配：响应式布局（三栏 → 单栏切换）、触控交互替代鼠标拖拽
- 离线支持：SQLite 本地存储替代 JSON 文件，Service Worker 缓存
- 数据同步：如需多端同步，需设计同步协议（CouchDB/CRDT/云端存储）

**前置条件：** 功能趋于稳定，不再频繁改动核心架构。过早打包会拖慢迭代。

---

## 架构备忘

以下不是独立需求，而是随项目演进需持续关注的架构问题：

- **Session 模型保持薄**：`Session` 只是目录指针（`{ id, concept, createdAt }`），所有丰富度来自 `data/{sessionId}/` 目录下的文件。新增能力 = 新增文件约定，不加 Session 字段，不做 schema migration。
- **上下文编排器是核心**：Context Assembler（`services/contextAssembler.ts`）是项目的脊柱——用户选择哪些文件/块参与对话，Assembler 汇集并传给 LLM。所有上下文源（profile、prompt、session 文件、跨 session 引用）统一通过 Assembler 流入。
- **存储层抽象**：当前 JSON 文件存储无锁无并发。单用户没问题，但多端同步（Electron + 移动端）前需要抽象存储接口（Store interface），方便后续切换到 SQLite 或云端存储。不需要现在就做，但新增存储逻辑时注意不要过度耦合 JSON 文件实现。
- **客户端测试**：CLAUDE.md 要求 TDD，但客户端零测试。随着 Tier 1（面板拖拽）、Tier 4（内联 chips）等交互复杂功能的加入，缺少测试会越来越痛苦。建议在实现新的客户端功能时同步补测试，不需要补历史债。
- **性能**：当前无明显瓶颈，但 session 文件数量增长后文件列表 API 可能变慢（`fs.readdir` + `stat`）。大量消息的 `messages.json` 全量读写也是潜在问题。留意，按需优化。

---

## 依赖关系

```
独立任务（可并行）:
  面板拖拽调整大小
  里程碑栏折叠 + 进度条
  SSE 流中断恢复 + 消息重试
  Writing 状态指示
  多行选中 → 文件引用
  自由对话式开始学习
  聊天自动滚动智能暂停
  代码块语法高亮

有依赖链:
  System Prompt 文件化 [完成]
    ├→ LLM Provider 运行时切换（需 system prompt 文件化作为基础）
    └→ Session 级教学指令（追加到全局 prompt）

  自由对话式开始学习
    └→ Session 标题自动摘要（低优先级，需自由输入作为前提）

  上下文编排器 (Context Assembler) ← 核心架构
    └→ 用户 Profile 分块（第一个数据源）
    └→ 后续扩展：prompt 分块、跨 session 引用...

  用户 Profile 分块 + 选择性注入
    └→ 依赖现有 profile API（已有）
    └→ 依赖 Context Assembler 框架

  Teacher Agent 互联网搜索
    └→ 导出功能（搜索结果可纳入导出）

  视觉输入支持
    └→ 依赖多模态 LLM（模型层面）

  内联引用 chips（Tier 4）
    └→ 需先稳定 多行选中 → 文件引用（Tier 2）

  聊天历史文件化 + Fork（Tier 4）
    └→ 多 Session 间共享文件 / 跨 Session 引用（Tier 3）

  Electron 桌面应用（Tier 5）
    └→ blocked by: 存储层抽象
    └→ blocked by: 功能趋于稳定
```
