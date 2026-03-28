# Tool Manager, Web Search, And Fetch URL

当前实现已经不是“单独的搜索配置页”，而是一个统一 Tool Manager 体系中的一部分。

## 当前模型

工具分成两层：

- **SessionDraft / SessionContext**
  控制“这个工具是否对模型可见、是否注入提示词”
- **Global Tool Config**
  控制“这个工具如何运行”，例如 runtime mode、端口、provider、超时

因此：

- Landing Page 选择的工具，会进入下一次新建 Session
- 创建 Session 时，这份工具可见性会物化成 `data/{sessionId}/session-context.json`
- 已创建 Session 不会被之后的 landing 变更回溯影响
- `data/tool-config.json` 只负责基础设施，不负责“下一次 Session 默认启用哪些工具”

## 当前工具

当前 Tool Registry 中与外部信息相关的工具有：

- `fetch_url`
- `web_search`

另外还有：

- `read_file`
- `write_file`
- `browser` 预留定义，暂不暴露给模型

## web_search

`web_search` 是受管工具，支持两种 runtime mode：

- `local`
- `external`

### local

Tool Manager 托管整套本地搜索栈：

- backend
- sidecar

默认实现：

- 本地 provider：`duckduckgo`
- backend 端口：`18081`
- sidecar 端口：`18080`

行为：

- 首次真正调用 `web_search` 时懒启动
- Tool Manager 会检查 / 启动 / 重启 / 停止 runtime
- UI 上会显示 runtime 状态而不是只显示抽象“已启用”

### external

只启动工具接口层 sidecar，再去连接外部搜索端点。

当前兼容目标是：

- SearXNG-compatible endpoint

因此如果你已经有外部搜索服务，可以把 `externalBaseURL` 指过去。

## fetch_url

`fetch_url` 已经是正式工具，不再是未来计划。

它的职责是：

- 接收一个具体 URL
- 抓取网页
- 提取更适合阅读的正文内容
- 返回给 Teacher 用于总结、引用或后续写入文件

推荐链路是：

1. `web_search` 找候选结果
2. `fetch_url` 读取其中 1 到 2 个高价值页面
3. `write_file` 把有价值的摘要沉淀到 session 文件

## 关键文件

- `data/tool-config.json`
  全局工具基础设施配置
- `data/session-draft/manifest.json`
  Landing Page 上下一次 Session 的默认启用工具
- `data/{sessionId}/session-context.json`
  某个已创建 Session 的工具可见性快照

## 相关实现

- `packages/server/src/services/toolRegistry.ts`
  工具元数据、提示词片段、LLM schema
- `packages/server/src/services/toolManager.ts`
  工具可见性与 prompt 注入解析
- `packages/server/src/services/toolRuntimeManager.ts`
  runtime 状态、启动、停止、重启
- `packages/server/src/services/searchService.ts`
  `web_search` 调用入口
- `packages/server/src/services/fetchUrlService.ts`
  `fetch_url` 调用入口

## 兼容说明

旧的搜索配置和接口仍保留了一层兼容，但已经不是主路径：

- 旧 `search-config.json` 会在读取时迁移
- 旧 `/api/search-config` 仍可工作，但新 UI 使用的是 tools 相关接口

如果要继续开发，优先以以下心智模型为准：

- 工具可见性属于 `SessionDraft / SessionContext`
- 工具 runtime 属于 `Global Tool Config`
- preview、memory、真实模型注入都应与这套工具选择保持一致
