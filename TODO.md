# 待完成需求

## 当前已实现

- [x] 多附件 chips（文件引用 + 引用文本），显示在输入框上方
- [x] 智能粘贴：从编辑器复制 → 粘贴到聊天自动创建文件引用 chip
- [x] Backspace 删除最后一个 chip
- [x] 文件类型不限于 `.md`，支持任意扩展名
- [x] 工具调用事件在聊天中可视化（可展开查看参数/结果）
- [x] Session 切换（← Sessions 返回按钮）

---

## P1: 面板自由拖拽调整大小

**现状：** 文件树 `w-52`、聊天面板 `w-96` 均为固定宽度，编辑器占剩余空间。里程碑栏高度由内容撑开。

**目标：** 文件树 | 编辑器 | 聊天面板三列之间可拖拽分割线调整宽度；里程碑栏与编辑器之间可拖拽调整高度。

**工程要点：**
- 实现通用 `ResizeHandle` 组件：监听 mousedown → mousemove → mouseup，计算偏移量
- 用 CSS `cursor: col-resize` / `row-resize` 提示拖拽方向
- 面板宽度存入 state（或 localStorage 持久化），替换固定 Tailwind class
- 设置 `min-width` / `max-width` 防止面板被拖到不可用尺寸
- 拖拽过程中需 `pointer-events: none` 覆盖层防止 iframe/selection 干扰

---

## P2: 里程碑栏折叠 + 进度条

**现状：** MilestoneBar 始终展开显示所有里程碑 pill，无法收起。

**目标：** 可折叠。收起状态下显示紧凑进度条，格式如 `学习进度 ███░░░░ 3/10`。

**工程要点：**
- 添加 `collapsed` state + 切换按钮（chevron 图标）
- 收起态：单行，左侧标题，中间进度条（`<div>` 填充百分比），右侧 `completed/total`
- 展开态：保持当前 pill 列表布局
- 折叠状态可选持久化到 localStorage

---

## P3: 所有文件允许编辑

**现状：** `guidance.md`、`ground-truth.md`、`milestones.md` 被 `isSystemFile` 标记为只读，不显示 Edit 按钮。

**目标：** 移除系统文件限制，所有文件均可编辑。

**工程要点：**
- MarkdownEditor 中删除 `isSystemFile` 判断，统一显示 Edit/Save/Cancel
- 可选：编辑系统文件时显示警告（"此文件由 Teacher 管理，手动修改可能被覆盖"）

---

## P4: Markdown 表格渲染

**现状：** ReactMarkdown 默认不渲染 GFM 表格，表格显示为无样式 HTML 或纯文本。

**目标：** 编辑器预览和聊天消息中正确渲染表格，带边框、对齐、条纹行。

**工程要点：**
- 安装 `remark-gfm`，配置 `<ReactMarkdown remarkPlugins={[remarkGfm]}>`
- Tailwind `prose` class 已包含基础表格样式，启用 remark-gfm 后应自动生效
- 需在 MarkdownEditor 和 ChatPanel 的 `MessageContent` 两处统一配置
- 附带获得 GFM 能力：删除线、任务列表复选框、自动链接

---

## P5: LLM Provider 可配置 + 文件化

**现状：** LLM 配置通过 `.env` 环境变量（`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`），修改需重启服务。

**目标：** 配置存储为文件（如 `data/llm-config.json`），支持运行时切换 provider 无需重启。

**工程要点：**
- 配置格式：`{ provider, baseUrl, apiKey, model, temperature, ... }`
- 服务端 `llm.ts`：按需读取配置文件创建 provider 实例，而非启动时固定绑定
- 客户端：新增设置页面或弹窗，编辑配置并写回（通过 API 端点）
- apiKey 安全：客户端仅显示掩码，写入时合并而非全量覆盖
- 可选支持多 provider profile 快速切换

---

## P6: 发送按钮禁用态样式区分

**现状：** 发送按钮禁用时仅 `opacity-40 cursor-not-allowed`，无法区分「正在流式输出」和「输入为空」。

**目标：**
- 输入为空 → 灰色低透明度（当前样式）
- 流式输出中 → 变为「停止」按钮（红色/方块图标），点击中断流

**工程要点：**
- ChatPanel 发送按钮根据 `streaming` vs `!input.trim()` 渲染不同 UI
- 流式中显示 Stop 按钮，需从 props 新增 `onStop` 回调
- `useSession` 暴露 `stopStreaming()` 方法（调用 AbortController.abort）

---

## P7: 长文本编辑流式显示 / Writing 状态

**现状：** Agent 通过 `write_file` 写入后，客户端一次性刷新。大文件写入期间编辑器无反馈。

**目标：** Agent 写入当前打开文件时，编辑器展示 "Writing..." 状态指示；写入完成后刷新。

**工程要点：**
- 基础方案：`tool-call`（write_file 且目标 = activeFile）时在编辑器顶部显示状态条；`tool-result` 后移除并刷新
- 进阶方案：SSE 携带 write_file 内容片段，编辑器实时追加显示
- 进阶需改 `teacher.ts` 工具执行逻辑，将写入内容拆为流式 SSE

---

## P8: 内联引用 chips

**现状：** chips 集中出现在 textarea 上方，与文本输入分离。

**目标：** 像 Cursor 一样，引用 chip 与普通文字混排在同一个输入区域内。

**工程要点：**
- `<textarea>` 无法渲染 HTML 节点，需替换为 `contentEditable` 或富文本编辑器库
- 候选方案：TipTap（ProseMirror）、Slate.js
- 需处理：光标定位、chip 插入/删除/键盘导航、内容序列化（chip → `[file:start:end]`）
- ChatPanel 输入区域重写 + 新增依赖

---

## P9: 多行选中 → 文件引用

**现状：** `content.indexOf(selectedText)` 匹配原文行号，多行或含格式的选中文本无法匹配（渲染文本 ≠ 源码）。

**目标：** 选中编辑器中任意多行内容，"Add to Chat" 后正确识别源文件行号范围。

**工程要点：**
- 自定义 ReactMarkdown renderer，注入 `data-source-line` 属性
- 从 DOM Selection 的 anchorNode/focusNode 读取行号反推范围
- 智能粘贴路径不受影响，已可处理多行

---

## P10: 用户上下文 Profile 文件化

**现状：** 无用户个人上下文机制。Teacher Agent 对学生背景一无所知，每次对话从零开始。

**目标：** 用户上下文存储为可编辑文件（如 `data/profile.md`），内容自由定义——学习目标、身份职业、年龄、文化背景等，不预设任何字段。文件按结构化标记分块，用户可选择哪些块传给模型。

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

或 XML 标签格式：
```xml
<context name="基本信息">
25岁，计算机专业研究生
</context>

<context name="学习目标">
深入理解分布式系统原理，准备面试
</context>
```

**工程要点：**
- 解析器：支持 `# 标题` 或 `<context name="...">` 两种分块方式，每块提取为 `{ name, content }` 对象
- 服务端：读取 profile 文件 → 解析分块 → 注入 system prompt（全部或用户选择的子集）
- 客户端：Profile 编辑页面（本质就是打开 profile 文件编辑）+ 块选择 UI（勾选哪些块本次生效）
- API：`GET/PUT /api/profile` 读写文件；`GET /api/profile/blocks` 返回解析后的块列表
- 块选择状态可存为 session 级别配置（不同 session 可选不同子集）
- 当前已有 `getProfile` / `updateProfile` API 端点，可复用扩展

---

## P11: Electron 桌面应用 + 移动端

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

---

## P12: 聊天历史文件化

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

---

## P13: Teacher Agent 互联网搜索工具

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

## P14: 配置 ESLint + Prettier

**现状：** 无 linter 或 formatter，代码风格全靠人工保持一致。

**目标：** 根目录统一配置 ESLint + Prettier，两个包共享规则。提交前自动检查。

**工程要点：**
- ESLint：使用 flat config（`eslint.config.js`），启用 `@typescript-eslint` 规则集
- Prettier：`.prettierrc` 配置（单引号、无分号、2 空格缩进等，与现有代码风格匹配）
- 根目录 `package.json` 添加 `lint` / `format` / `lint:fix` scripts
- `lint-staged` + `husky`：git commit 时自动对 staged 文件执行 lint + format
- 首次配置需一次性格式化全量代码（单独一个 commit：`chore: format codebase`）
- 确保 ESLint 与 Prettier 不冲突（`eslint-config-prettier` 关闭冲突规则）
- React 相关规则：`eslint-plugin-react-hooks`（enforce rules of hooks）
