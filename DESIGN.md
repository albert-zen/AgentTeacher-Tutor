# 上下文编排器 — 架构设计

> 本文档记录 Teacher Agent Notebook 向「上下文编排器」演进的设计共识。
> 基于 2026-02 的架构讨论，作为后续实现的指导。

---

## 核心理念

**上下文编排器 (Context Orchestrator)** — 让人和 Agent 都能灵活地构建、编辑、选择传入给模型的上下文。

三个设计原则：

1. **Everything is a file** — 所有上下文（学习材料、profile、prompt、聊天历史）均以文件形式存在，可编辑、可引用
2. **文件结构即分块策略** — Markdown 按标题分块、JSON 按 key 分块。不需要额外索引，文件格式本身决定如何导航
3. **Config 是编译清单** — `context-config.json` 完整描述一次 LLM 调用的输入材料，所有值都是引用/句柄，编译器将其解析为实际内容

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                         文件系统                             │
│                                                             │
│  profile.md  system-prompt.md  session-prompt.md            │
│  chat history    guidance.md    ground-truth.md   ...       │
│                                                             │
│                  context-config.json                         │
└────┬──────────────────────┬─────────────────────────────────┘
     │                      │                      ↑
     │ 文本编辑器界面        │ 上下文编排器           │ 上下文查找
     │ (人类读写)           │ (编译 config → 上下文)  │ 选择工具
     ↓                      ↓                      │
┌──────────┐         ┌──────────────┐        ┌─────┴────┐
│ 人类用户  │         │ Context      │───────→│  Agent   │
│          │         │ Compiler     │        │          │
└──────────┘         └──────────────┘        └────┬─────┘
                                                  │
                                                  ↓
                                             ┌──────────┐
                                             │ 结果交付   │
                                             │ (SSE 流)  │
                                             └──────────┘
```

**双通道架构：**
- **人类** 通过文本编辑器直接读写文件系统
- **Agent** 通过上下文查找工具在运行时主动读写文件系统
- 两者共享同一个文件系统作为 single source of truth

**两阶段上下文：**
- **Pre-call（编排器编译）：** 根据 config.json 编译初始上下文传给 Agent
- **Runtime（Agent 主动查找）：** Agent 通过工具在对话中按需获取更多上下文

---

## 文件系统设计

> 构造便于 Agent 导航的文档与文件夹结构

```
data/
├── profile.md                     # 用户档案，按 # 标题分块
├── system-prompt.md               # 全局系统提示词
├── sessions.json                  # session 索引（薄记录）
│
└── {sessionId}/
    ├── context-config.json        # 上下文编译清单
    ├── session-prompt.md          # session 级教学指令（追加到全局 prompt）
    ├── messages.json              # 聊天历史
    ├── milestones.md              # 学习进度 (- [x] / - [ ])
    ├── guidance.md                # Agent 生成的教学指南
    ├── ground-truth.md            # 知识文档
    └── ...                        # 任意文件，everything is a file
```

### Session 保持薄

`Session = { id, concept, createdAt }` — 永远只有三个字段。所有丰富度来自 session 目录下的文件。新增能力 = 新增文件约定，不加 Session 字段。

### 文件格式即分块策略

| 格式 | 分块方式 | 示例 |
|------|---------|------|
| Markdown | 按 `#` 标题层级嵌套分块 | profile.md, guidance.md |
| JSON | 按 key 层级嵌套分块 | context-config.json |
| XML | 按元素层级嵌套分块 | （未来扩展） |

早期只实现 Markdown 分块解析。

---

## 块系统 (Block System)

### 核心概念

文件由**块 (Block)** 组成。块通过解析文件内容自动生成，支持嵌套。每个块有唯一 ID。

```typescript
interface Block {
  id: string;           // 唯一标识符
  heading: string;      // 标题文本（如 "教育背景"）
  level: number;        // 层级（# = 1, ## = 2, ### = 3）
  content: string;      // 该块的正文内容（不含子块）
  children: Block[];    // 子块（嵌套）
  source: {
    file: string;       // 来源文件
    startLine: number;  // 起始行号
    endLine: number;    // 结束行号
  };
}
```

### Markdown 分块示例

```markdown
# 基本信息                    ← Block level=1
25岁，计算机专业研究生

## 教育背景                   ← Block level=2, parent=基本信息
本科: 软件工程
研究生: 计算机科学

## 工作经验                   ← Block level=2, parent=基本信息
3年后端开发

# 学习目标                    ← Block level=1
深入理解分布式系统原理
```

解析结果：

```
profile.md
├── Block "基本信息" (L1-L2)
│   ├── content: "25岁，计算机专业研究生"
│   ├── Block "教育背景" (L4-L6)
│   │   └── content: "本科: 软件工程\n研究生: 计算机科学"
│   └── Block "工作经验" (L8-L9)
│       └── content: "3年后端开发"
└── Block "学习目标" (L11-L12)
    └── content: "深入理解分布式系统原理"
```

### Block ID 方案

**V1（初始方案）：标题路径作为 ID**

```
"基本信息"              → id: "基本信息"
"基本信息 > 教育背景"    → id: "基本信息/教育背景"
"基本信息 > 工作经验"    → id: "基本信息/工作经验"
"学习目标"              → id: "学习目标"
```

- 确定性：相同内容 → 相同 ID
- 人类可读：在 config.json 中直观
- 局限：改标题会使引用失效（可用模糊匹配 fallback）

**V2（演进方案）：持久化短 ID + sidecar 映射**

```
"基本信息"              → id: "b1a2c3"
"教育背景"              → id: "d4e5f6"
```

- 存储在 sidecar 文件（如 `profile.blocks.json`）
- 标题改名不会断链
- 需要维护映射文件

V1 先行，验证块选择的整个链路后按需演进到 V2。

### 分块解析器

```typescript
// services/blockParser.ts — 纯函数，输入 markdown 文本，输出块树

function parseMarkdownBlocks(content: string, filePath: string): Block[]
function getBlockById(blocks: Block[], id: string): Block | undefined
function flattenBlocks(blocks: Block[]): Block[]  // 展平嵌套，便于遍历
```

---

## 上下文编译器 (Context Compiler)

### 编译清单 (context-config.json)

Config 不是「用户偏好」，而是一次 LLM 调用的**完整输入规格**。所有值都是引用/句柄，编译器将其解析为实际内容。

```json
{
  "systemPrompt": [
    { "type": "global", "file": "system-prompt.md" },
    { "type": "session", "file": "session-prompt.md" }
  ],
  "profileBlocks": ["学习目标", "已有基础"],
  "chatHistory": {
    "source": "messages.json",
    "strategy": "full"
  },
  "query": "这段是什么意思 [guidance.md:12:30]",
  "references": [
    { "path": "guidance.md", "startLine": 12, "endLine": 30 },
    { "path": "ground-truth.md", "block": "薛定谔方程" }
  ]
}
```

### Config 的生命周期

| 部分 | 持久性 | 何时变更 |
|------|--------|---------|
| `systemPrompt` | 持久（session 级） | 用户修改设置时 |
| `profileBlocks` | 持久（session 级） | 用户勾选/取消 profile 块时 |
| `chatHistory` | 半持久 | 通常 = 全部历史，未来可选裁剪策略 |
| `query` | 瞬时（每条消息） | 每次发送 |
| `references` | 瞬时（每条消息） | 每次附带的引用 |

### 编译流水线

```
                         Context Compiler Pipeline
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ 1.Resolve│→│ 2.Select │→│ 3.Merge  │→│ 4.Format │→│ 5.Emit   │
│  Sources │  │  Blocks  │  │  Refs    │  │          │  │          │
└──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘

1. Resolve Sources
   读取 systemPrompt 文件 → 拼合全局 + session 级提示词

2. Select Blocks
   解析 profile.md → 分块 → 按 profileBlocks 列表选取子集

3. Merge References
   解析 query 中的 inline [file:s:e] 引用
   + 显式 references[] (行引用 + 块引用)
   → 读取内容 → 拼入用户消息

4. Format
   构建 chatHistory → ModelMessage[]
   当前消息（含已解析引用）作为最后一条

5. Emit
   输出 { systemPrompt: string, messages: ModelMessage[] }
   → 直接传给 LLM
```

每个阶段是一个纯函数，可独立测试。

```typescript
// services/contextCompiler.ts

interface CompiledContext {
  systemPrompt: string;
  messages: ModelMessage[];
}

function compileContext(
  dataDir: string,
  store: Store,
  config: ContextConfig
): CompiledContext
```

---

## Agent 工具接口

### 设计原则：模仿 shell 语义

LLM 对 shell 命令的理解最为深厚（训练数据中大量 shell 用法）。工具接口应尽可能接近 shell 语义，降低 Agent 的学习成本。

### 当前工具

```
read_file(path, startLine?, endLine?)    # ≈ cat / sed -n 's,ep'
write_file(path, content, startLine?, endLine?)  # ≈ echo > / patch
```

### 未来可扩展（上下文查找选择工具）

```
list_files(dir?)                         # ≈ ls / find
search(pattern, path?)                   # ≈ grep -r
read_block(file, blockId)                # 按块 ID 读取（块系统专用）
```

这些工具让 Agent 在对话过程中主动导航文件系统、查找相关上下文，而不仅仅是被动接收编排器的编译结果。

所有工具仍在沙箱内运行（限制在 session 目录），保持安全。

---

## 引用系统

### 两种引用粒度

| 类型 | 语法 | 用途 | 精度 |
|------|------|------|------|
| **行引用** | `[file.md:12:30]` | 对话中精确定位 | 行级 |
| **块引用** | `[file.md#块名]` 或 `[file.md#父/子]` | 上下文选择 | 语义级 |

**行引用** — 现有系统，用于聊天中引用文件的精确行范围。适合讨论具体内容。

**块引用** — 新增，用于 config.json 中选择上下文块。适合「把 profile 的学习目标传给 Agent」这类语义级选择。

两种引用在 config.json 中共存：

```json
{
  "references": [
    { "path": "guidance.md", "startLine": 12, "endLine": 30 },
    { "path": "profile.md", "block": "学习目标" }
  ]
}
```

编译器统一解析：行引用直接读行，块引用通过 blockParser 解析后定位到行范围再读取。

---

## 共享逻辑：Part Accumulator

### 问题

服务端 (`session.ts:159-190`) 和客户端 (`useSession.ts:44-83`) 有完全重复的 part 累积逻辑——连续 `text-delta` 合并为一个 text part，`tool-call`/`tool-result` 打断合并。

### 方案

提取为共享模块，两端引用同一份代码。

```typescript
// shared/partAccumulator.ts

function createPartAccumulator() {
  return {
    push(event: StreamEvent): void,   // 处理一个流事件
    getParts(): MessagePart[],         // 当前累积的 parts
    getText(): string,                 // 累积的全文
    getToolEvents(): ToolEvent[],      // 累积的工具事件
    toMessage(sessionId: string): ChatMessage | null,  // 构造 assistant 消息
  };
}
```

---

## 迁移路径

从当前架构到目标架构，逐步演进，每步独立可测试。

```
Step 0 — 当前状态
  session.ts 237 行，包含 CRUD + SSE + 引用解析 + part 累积
  useSession.ts 与 session.ts 重复 part 累积逻辑

Step 1 — 提取 Part Accumulator
  从两端提取共享 partAccumulator
  行为不变，只消除重复
  ← 最小改动，立即收益

Step 2 — 提取 Context Compiler
  从 session.ts 中提取引用解析 + 历史构建 → contextCompiler.ts
  chat route 调用 compileContext() 替代内联逻辑
  resolveSystemPrompt 成为 compiler 内部调用
  ← 为块系统铺平道路

Step 3 — 拆分 Routes
  session.ts → session.ts (CRUD) + chat.ts (SSE)
  chat.ts 变成薄胶水（~30 行）
  ← 单文件职责清晰

Step 4 — 块系统
  实现 blockParser（Markdown 分块）
  API: GET /api/profile/blocks 返回解析后的块列表
  UI: profile 块选择界面
  ← Context Assembler 的第一个真实数据源

Step 5 — 上下文选择 UI
  context-config.json 读写
  块选择面板（勾选哪些块参与上下文）
  上下文预览 API: GET /api/session/:id/context-preview
  ← 用户可见的上下文编排

Step 6 — Agent 工具扩展
  增加 list_files / search / read_block 工具
  Agent 运行时主动导航文件系统
  ← 双向上下文工程
```

---

## Future Vision：通用上下文编排器

> 以下为长期愿景，记录设计思考，**不进入当前实现计划**。
> 当前项目聚焦教学场景，做好 Step 1-6 即可。未来如有第二个 agent 应用，从已验证的代码中提取通用层。

### 两层上下文抽象

当前编译器是「编译 config → LLM 输入」的单层模型。未来可演进为两层：

| 层 | 职责 | 示例 |
|----|------|------|
| **Injection Layer**（每次调用注入） | 编排器自动向 LLM 注入 reminders — 学员信息、系统约定、长程计划节点等 | `"injections": [{ "source": "profile.md", "block": "基本信息", "mode": "always" }]` |
| **Memory Curation**（记忆筛选） | chatHistory 不再是 messages.json 的直接映射，而是被筛选过的视图 | 用户或模型可标记某些内容为「不重要」，编译器用占位符替代原文 |

### Memory Curation 机制

- **文件系统 = 完整记录**（messages.json 永远保存所有内容）
- **chatHistory = 工作记忆**（编译器根据 memoryStatus 输出原文或占位符）
- **两个筛选者**：用户主动排除 / 模型自主判断无用
- **占位符保持因果连贯**：`[已读取 ground-truth.md:30-50 — 模型判断：与当前问题无关]`

### 模型自主 dismiss（方案 A：工具调用）

给模型一个 `dismiss_memory` 工具，粒度为 tool-result 级别：

```typescript
dismiss_memory(params: {
  targetMessageId: string,   // 指向要压缩的 tool-result
  summary: string            // 模型写的摘要，作为占位符
})
```

模型在读取内容后判断无用时主动调用，dismiss 本身作为 tool event 记录，完全可审计。

### 为什么不现在做

- 只有一个消费者（教学场景），过早抽象易产生错误接口
- 当前 Step 1-6 已足够支撑教学需求
- 保持编译器阶段化纯函数设计，未来提取成本低

---

## 设计灵感

本架构设计借鉴了以下模式：

| 来源 | 借鉴的模式 |
|------|-----------|
| Google ADK | "Context is a compiled view" — 上下文是从丰富状态系统编译出的视图 |
| Cursor IDE | Codebase indexing + semantic search — 语义级代码理解（我们用自然结构分块替代） |
| Windsurf Cascade | Deep contextual awareness — Agent 对整个工作区的深度感知 |
| Notion | Block 概念 — 内容由可引用、可嵌套的块组成 |
| Anthropic | Artifact pattern — 大数据用句柄引用，不内联进 prompt |
| Shell/Unix | 工具接口设计 — Agent 最熟悉的操作范式 |
