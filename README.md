# Teacher Agent Notebook

Teacher Agent Notebook 是一个面向学习场景的 AI 工作台。

它不是一个“只有聊天框”的工具，而是一个让 `Teacher Agent` 一边生成学习材料、一边陪你推进学习过程的笔记本。你可以把它理解成：

- 左边是学习资料和上下文文件
- 中间是可编辑的 Markdown 工作区
- 右边是和 Teacher 的对话

这个项目的核心想法很简单：

> 学习上下文不应该藏在 prompt 里，而应该作为文件被看见、编辑、引用和复用。

## 它适合做什么
- 让 AI 帮你围绕一个主题搭建完整学习 session
- 自动生成 `guidance.md`、`ground-truth.md`、`milestones.md` 等材料
- 一边聊天，一边让 Agent 读写这些文件
- 精确引用文件片段继续追问，而不是反复复制粘贴大段内容
- 把“聊天 + 笔记 + 学习计划”放在同一个工作区里

## 你会怎么使用它
一个典型流程大概是：

1. 输入一个学习目标，比如“我想系统学二分查找”
2. 创建一个 session
3. Teacher 生成学习材料和里程碑
4. 你在编辑器里直接改材料，或者在聊天里继续追问
5. 需要引用材料时，直接把文件片段插入聊天
6. 整个 session 的内容都保存在文件里，可以继续演进

## 核心体验
### 1. 三栏工作区
- 文件树：查看这个 session 下有哪些学习文件
- 编辑器：直接修改学习材料
- 聊天面板：和 Teacher 对话、引用文件、查看流式输出
- 上下文预览 / 模型记忆：可视化查看模型实际会吃到哪些上下文模块

### 2. Everything is a file
项目里很多“上下文”都不是隐式状态，而是文件：

- 学习材料是文件
- session draft 和 session prompt 都是文件
- profile 是文件
- 聊天历史也是 session 数据的一部分

这让上下文更容易被检查、组织和复用。

### 3. 精确引用，而不是模糊复制
你可以在聊天中引用某个文件或某个片段，服务端会自动解析这些引用并注入上下文。这样 Teacher 回答时是“看过材料再说”，而不是纯猜测。

### 4. 长聊天也能继续用
聊天历史较长时，应用会优先加载最近消息，并按需向上加载更早历史，避免整个界面因为消息过多变得很卡。

## 快速开始
### 安装依赖
```bash
npm install
```

### 配置模型
在仓库根目录创建 `.env`：

```bash
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=
```

说明：

- 服务端使用 OpenAI-compatible API
- 如果不配置模型，应用仍然可以作为文件型笔记工具运行，但不会真正生成 AI 回复

### 启动开发环境
```bash
npm run dev
```

默认端口：

- Client: `http://localhost:5173`
- Server: `http://localhost:3001`

也可以分别启动：

```bash
npm run dev:server
npm run dev:client
```

## 常用命令
```bash
npm test
npm run lint
node ./node_modules/typescript/bin/tsc --noEmit -p packages/server/tsconfig.json
node ./node_modules/typescript/bin/tsc --noEmit -p packages/client/tsconfig.json
```

## 项目结构
如果你只是想快速理解项目，先记住这几个地方就够了：

- `packages/client/src/App.tsx`
  负责在 Landing 和 Workspace 两个 shell 之间切换
- `packages/client/src/components/LandingShell.tsx`
  新建 Session 前的上下文编排台
- `packages/client/src/components/WorkspaceShell.tsx`
  三栏工作区与 Session 内的工具 / 记忆入口
- `packages/client/src/hooks/useSessionDraft.ts`
  Landing Page 上 `SessionDraft` 的状态与保存
- `packages/client/src/hooks/useSession.ts`
  session、消息、流式响应、历史分页这些核心状态都在这里
- `packages/client/src/components/ChatPanel.tsx`
  聊天 UI、本地流式展示、长历史渲染优化都在这里
- `packages/server/src/routes/session.ts`
  session 元数据、消息分页、上下文预览相关接口
- `packages/server/src/routes/files.ts`
  文件 CRUD 以及 profile / prompt / tool / draft 配置接口
- `packages/server/src/services/sessionDraftService.ts`
  `SessionDraft -> SessionContext` 的持久化与物化
- `packages/server/src/services/contextSections.ts`
  统一生成 draft preview / session memory / 模型注入 sections
- `packages/server/src/services/toolRegistry.ts`
  统一定义工具元数据、提示词片段、runtime 能力与 LLM tool schema

## 数据是怎么存的
Landing Page 有一份“下一次新 Session 的草稿”，每个已创建 session 也有自己的目录和上下文快照。

大致是这样的：

```text
data/
  session-draft/
    manifest.json
    session-prompt.md
  tool-config.json
  sessions.json
  profile.md
  system-prompt.md
  {sessionId}/
    messages.json
    session-context.json
    guidance.md
    ground-truth.md
    milestones.md
    session-prompt.md
```

这意味着：

- Landing Page 编辑的是 `SessionDraft`
- 创建 Session 时会把草稿物化成 `session-context.json` 和 `session-prompt.md`
- 已创建 Session 不会被之后的 landing 修改回溯影响

## 当前项目方向
Teacher Agent Notebook 正在从“AI 教学笔记本”进一步往 **Context Orchestrator** 方向发展：

- 更清晰地展示模型实际看到了哪些上下文模块
- 让 Landing Draft、Session Context、模型注入三者语义分离
- 通过 Tool Manager 统一管理工具启用、提示词注入和 runtime
- 继续为图片、多模态、可管理工具栈等能力打基础

## 想继续了解
- 更偏实现细节的说明：`ARCHITECTURE.md`
- 工具与联网搜索说明：`SEARCH.md`
- 更偏内部开发约定的说明：`CLAUDE.md`
