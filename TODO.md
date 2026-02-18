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
- [x] 代码块语法高亮：共享 `MarkdownRenderer` 组件，Prism + oneDark 主题
- [x] 聊天自动滚动智能暂停：`isNearBottomRef` + scroll 事件，用户上滚时停止自动滚动
- [x] 自由对话式开始学习：textarea 输入，去掉 `我想学习：` 前缀，title tooltip
- [x] 里程碑栏折叠 + 进度条：collapsed state + localStorage 持久化 + 进度条 UI
- [x] 面板自由拖拽调整大小：`ResizeHandle` 组件，ref-based DOM 操作避免重渲染
- [x] LLM Provider 运行时切换：`llm-config.json` 文件持久化，可编辑 UI 模态框，env fallback
- [x] Writing 状态指示：`writingFile` state，编辑器顶部蓝色 spinner
- [x] SSE 流中断恢复 + 消息重试：`failedMessage` state，红色重试条
- [x] System Prompt 文件化 + 可编辑
- [x] Session 级教学指令：`resolveSystemPrompt(dataDir, sessionId)` 追加 `session-prompt.md`，workspace 和 landing page 均可编辑
- [x] Session 教学指令草稿模板：landing page 编辑 `session-prompt-draft.md`，创建新 session 时自动复制
- [x] Session 标题自动摘要：首条消息后并行 LLM 调用生成 3-5 字标题，`updateSession` 更新
- [x] 用户 Profile 分块 + 选择性注入：`profileParser` 按 `#` 分块，`/profile/blocks` 端点，tabbed UI
- [x] 上下文编排器 Context Assembler 核心框架：`contextAssembler.ts` 纯函数，`context-preview` + `context-config` API
- [x] 全局深色 scrollbar 样式（6px thin，zinc 色调）
- [x] 流式处理中指示器（弹跳圆点 + "处理中" 文字）
- [x] ChatPanel 输入性能优化（useMemo 缓存消息列表）
- [x] 测试覆盖：56 → 150 tests（P0 SSE 聊天流 20 + P0 客户端状态机 16 + P1 数据层 14 + P2 补全 16 + session prompt 6 + context assembler 6 + profile parser 4）

---

## Tier 1: 体验基础

### Session 切换与退出时里程碑状态隔离

**现状：** `packages/client/src/App.tsx` 中 `milestonesContent` 只在 `files` 包含 `milestones.md` 时加载；当切换到不含 `milestones.md` 的 session，或退出 session 返回列表时，旧 session 的里程碑内容不会被主动清空，`MilestoneBar` 可能继续显示上一次内容。

**目标：** 退出或切换 session 后，里程碑栏只反映当前 session 数据；若当前 session 没有 `milestones.md`，里程碑栏应立即清空并隐藏，不出现跨 session 残留。

**工程要点：**
- 在 `packages/client/src/App.tsx` 的 `clearSession` 触发路径中同步清空 `milestonesContent`，确保退出 session 即刻归零。
- 在 `packages/client/src/App.tsx` 的里程碑加载 effect 中增加缺失分支：当 `!files.includes('milestones.md')` 时执行 `setMilestonesContent('')`。
- 在 session 切换流程（`handleLoadSession`）增加切换瞬间清空，避免异步读取返回前短暂显示旧里程碑。
- 为客户端补回归测试（`packages/client/__tests__`）：从“有 milestones.md 的 session”切到“无 milestones.md 的 session”，以及退出 session 场景，断言里程碑栏不残留。

### ChatPanel 对话布局改为单列左对齐

**现状：** `packages/client/src/components/ChatPanel.tsx` 第 290 行使用 `justify-end` / `justify-start` 将用户消息右对齐、助手消息左对齐，经典双侧气泡布局。两者均限制 `max-w-[85%]`（第 292 行），导致每条消息实际可用宽度仅为面板的 85%。对于包含代码块、表格等宽内容的助手回复，水平空间浪费明显；聊天面板本身已是三栏布局中最窄的一栏，双侧布局进一步压缩可用空间。

**目标：** 所有消息统一左对齐排列（类似 ChatGPT / Claude 的对话布局），通过背景色或角色标签区分发言者。助手消息可占满面板宽度，最大化内容显示空间。

**工程要点：**
- `ChatPanel.tsx` 第 290 行：去掉 `justify-end`/`justify-start` 条件切换，统一左对齐
- 去掉或放宽 `max-w-[85%]` 限制——助手消息用全宽，用户消息可保留 `max-w-[85%]` 或也放宽
- 用户消息视觉区分：现有 `bg-blue-600` 背景色保留，可选加角色标签（"你" / "Teacher"）或左侧色条
- 流式消息（第 322-334 行）和思考中状态（第 336-342 行）同步调整布局
- `useMemo` 依赖不变，无性能影响

### 聊天自动滚动流式期间无法上滚

**现状：** `packages/client/src/components/ChatPanel.tsx` 第 218-222 行，`useEffect` 依赖 `[messages, streamingParts]`，每次变化调用 `scrollIntoView({ behavior: 'smooth' })`。流式输出时 `useSession.ts:59` 每个 `text-delta` 都 `setStreamingParts([...parts])`（每 50-100ms），高频触发自动滚动。第 211-216 行 `handleScroll` 用位置判断 `isNearBottom`（阈值 80px），用户上滚时只有 50ms 窗口逃出 80px 范围，且 smooth 动画还在主动拉回，导致流式输出期间几乎无法上滚查看历史内容。

**目标：** 流式输出期间，用户一旦主动滚动（鼠标滚轮 / 触摸滑动）即立刻暂停自动滚动，不再被拽回底部。滚到底部时自动恢复。

**工程要点：**
- 改用事件检测替代位置检测：监听 `wheel` / `touchmove` 事件设 `isNearBottomRef = false`，用户一滚就暂停
- 恢复条件：`scroll` 事件中检测到达底部时重新设为 `true`（保留现有位置判断逻辑用于恢复）
- 流式期间用 `behavior: 'instant'` 替代 `smooth`，避免动画中间态干扰

---

## Tier 2: 上下文编排（项目核心差异化）

### 结构化 LLM 上下文 + Context Compiler 完整化

**现状：** `packages/server/src/routes/session.ts:93-185` 内联了引用解析、历史构建、上下文拼装全部逻辑（DESIGN.md Stage 3-5），与 CRUD/SSE 路由混在同一文件，共 304 行。历史消息 (`session.ts:156`) 使用 `m.content`（原始用户文本），LLM 无法看到前几轮引用的文件原文。发给 LLM 的上下文是纯文本拼接：system prompt 作为 `system` 参数，profile blocks 追加在末尾，引用以 `--- Referenced: file ---` 分隔符内联。显式 body `references[]` 路径 (`session.ts:118-123`) 检查不存在的 `ref.content` / `ref.filePath`，整段代码无效。`context-config.json` 在 preview API 中读取但 chat 路径未使用。`referenceParser.ts` 仅支持行引用 `[file:s:e]`，不支持块引用 `[file#blockId]`。

**目标：**
1. 实现 `contextCompiler.ts` 纯函数，接管 `session.ts` 中 Stage 3-5 全部逻辑，输出 `{ system: string, messages: ModelMessage[] }`
2. 每条用户消息发送时将引用原文快照持久化到 `ChatMessage`，历史回放时 LLM 看到当时的原文
3. 发给 LLM 的完整上下文采用结构化 XML 格式。Agent 每次看到的完整 query 示例：

```xml
<system_prompt>
[全局系统提示词内容]
</system_prompt>
<session_prompt>
[Session 级教学指令内容]
</session_prompt>
<profile_blocks>
[选中的 Profile 块内容]
</profile_blocks>
<chat_history>
<user>

这是什么[path:startline:endline],和这个有什么区别[path:blockid]
<selection path="路径/文件名" lines="起始行-结束行">
行号| 原文内容...
</selection>

<selection path="路径/另一文件" blockid="[blockId]">
行号| 原文内容...
</selection>
</user>

<assistant>
这是回复文本...

<function_calls>
<invoke name="write">
<parameter name="file_path">guidance.md</parameter>
<parameter name="contents">[实际文件内容]</parameter>
</invoke>
</function_calls>

<function_results>
<result>
<name>write</name>
<output>File written successfully</output>
</result>
</function_results>
</assistant>

<user>
下一轮用户消息（引用已在发送时展开为 selection 标签保存，历史回放时 LLM 看到当时的原文快照）
</user>
</chat_history>
```

4. 引用解析统一：行引用 `[file:s:e]` 和块引用 `[file#blockId]` 解析为同一 `ResolvedReference` 结构
5. `session.ts` chat handler 从 ~120 行降到 ~30 行胶水代码（对应 DESIGN.md Step 2-3）

**工程要点：**
- 新增 `packages/server/src/services/contextCompiler.ts`，实现 `compileContext(dataDir, store, sessionId, userMessage, config?): { system: string, messages: ModelMessage[] }`
- 内部实现 DESIGN.md 的 5 阶段流水线，每阶段是纯函数可独立测试
- `ChatMessage` 类型新增可选 `resolvedContent?: string` 字段，存储引用展开后的完整用户消息（含 `<selection>` 标签）
- `referenceParser.ts` 扩展：新增 `[file#blockId]` 正则，输出统一 `ParsedReference` 结构（行引用或块引用）
- 引用解析时调用 `FileService.readFile` + `profileParser`（块引用），将内容格式化为 `<selection>` 标签（行引用带 `lines` 属性 + 行号前缀，块引用带 `blockid` 属性）
- 助手消息历史：从 `parts` 字段重建 XML（text + `<function_calls>/<invoke>/<parameter>` + `<function_results>/<result>/<output>` 标签）
- `context-config.json` 在 compiler 中自动读取，不再需要路由层手动传递
- 路由拆分：`session.ts` → `session.ts`（CRUD）+ `chat.ts`（SSE），chat.ts 仅 ~30 行胶水
- 自然修复现有 bug：context-config 未接入 chat、references body 死代码、引用去重、历史消息缺引用原文

---

### 上下文编排器 Phase 2：可见的上下文

**现状：** Context Assembler 核心框架已完成。`assembleContext()` 纯函数汇集 system prompt + session 指令 + profile 分块。有 `context-preview` 和 `context-config` API。但用户端没有可视化面板来查看和选择上下文。

**目标：** 用户可以在 workspace 中看到"模型将看到什么"，并手动调整。

**工程要点：**
- 客户端：上下文预览面板（workspace 侧边或抽屉），调用 `context-preview` API 展示
- Profile 块选择 UI 已有（ProfileModal 的"分块"tab），需接入 `context-config` 保存选择状态
- 文件段落级选择：session 内文件也可按段落勾选
- 实时预览：选择变化时重新请求 preview

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
- **上下文编排器是核心**：`contextAssembler.ts` 已实现核心框架，整合 system prompt + session 指令 + profile 分块。下一步是客户端可视化面板和更多上下文源接入。
- **存储层抽象**：当前 JSON 文件存储无锁无并发。单用户没问题，但多端同步前需抽象 Store interface。`updateSession` 已新增。
- **客户端测试已建立**：vitest + jsdom + @testing-library/react。`useSession` hook 16 tests，`streamChat` 6 tests。新功能应同步补测试。
- **性能已优化**：面板拖拽用 ref + 直接 DOM（零重渲染），ChatPanel 输入用 useMemo 跳过消息列表重渲染。后续注意 session 文件数量增长时 API 性能。

---

## 依赖关系

```
已完成链:
  ✅ System Prompt 文件化
    ├→ ✅ LLM Provider 运行时切换
    └→ ✅ Session 级教学指令 + 草稿模板

  ✅ 自由对话式开始学习
    └→ ✅ Session 标题自动摘要

  ✅ Context Assembler 核心框架
    └→ ✅ 用户 Profile 分块

  ✅ Tier 1 全部 8 项完成

待完成:
  Session 切换与退出时里程碑状态隔离（独立）

  ChatPanel 对话布局改为单列左对齐（独立）

  聊天自动滚动流式抽搐修复（独立）

  结构化 LLM 上下文 + Context Compiler
    └→ 依赖 ✅ Context Assembler 核心
    └→ 自然修复: context-config 接入 chat / references 死代码 / 引用去重 / 历史缺引用

  上下文编排器 Phase 2（可见的上下文面板）
    └→ 依赖: 结构化 LLM 上下文 + Context Compiler

  多行选中 → 文件引用（独立）

  Teacher Agent 互联网搜索（独立）
    └→ 导出功能（搜索结果可纳入导出）

  视觉输入支持
    └→ 依赖多模态 LLM（模型层面）

  内联引用 chips（Tier 4）
    └→ 需先稳定 多行选中 → 文件引用

  聊天历史文件化 + Fork（Tier 4）
    └→ 多 Session 间共享文件 / 跨 Session 引用（Tier 3）

  Electron 桌面应用（Tier 5）
    └→ blocked by: 存储层抽象
    └→ blocked by: 功能趋于稳定
```
