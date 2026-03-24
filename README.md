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

### 2. Everything is a file
项目里很多“上下文”都不是隐式状态，而是文件：

- 学习材料是文件
- session prompt 是文件
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
  整个三栏工作区的主入口
- `packages/client/src/hooks/useSession.ts`
  session、消息、流式响应、历史分页这些核心状态都在这里
- `packages/client/src/components/ChatPanel.tsx`
  聊天 UI、本地流式展示、长历史渲染优化都在这里
- `packages/server/src/routes/session.ts`
  session 元数据、消息分页、上下文预览相关接口
- `packages/server/src/routes/chat.ts`
  真正的 SSE 聊天入口
- `packages/server/src/services/contextCompiler.ts`
  把 prompt、profile、引用片段、聊天历史拼成模型真正看到的上下文

## 数据是怎么存的
每个 session 都有自己的目录，里面放聊天记录和学习文件。

大致是这样的：

```text
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

这意味着 session 本身很薄，真正的内容都在文件里。

## 当前项目方向
Teacher Agent Notebook 正在从“AI 教学笔记本”进一步往 **Context Orchestrator** 方向发展：

- 更清晰地展示模型实际看到了哪些上下文
- 让上下文选择变得更显式
- 让聊天历史更像可编辑、可 fork 的材料
- 为图片、多模态、联网工具等能力打基础

## 想继续了解
- 更偏实现细节的说明：`ARCHITECTURE.md`
- 更偏内部开发约定的说明：`CLAUDE.md`
