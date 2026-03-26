# mem-feishu-v2 技术调研报告

> **版本**: v1.0 | **日期**: 2026-03-25 | **作者**: CTO (Manus AI)

---

## 一、调研范围

本报告覆盖了 mem-feishu-v2 项目设计前的三个核心调研方向：mem9 项目架构分析、OpenClaw 最新插件系统与社区记忆方案、以及国内向量数据库服务选型。

---

## 二、mem9 项目架构分析

### 2.1 项目概况

[mem9](https://github.com/mem9-ai/mem9) 是一个为 OpenClaw 提供 AI Agent 记忆功能的开源项目。它采用 TiDB Cloud Serverless 作为后端存储，利用 TiDB 内置的 `EMBED_TEXT` 函数进行向量化，通过 HTTP API 与 OpenClaw 插件通信。

### 2.2 架构分层

mem9 的 OpenClaw 插件（`openclaw-plugin/`）采用了清晰的分层架构：

| 文件 | 职责 |
|------|------|
| `index.ts` | 插件入口，注册工具和 hooks |
| `backend.ts` | 后端抽象接口 `MemoryBackend` |
| `server-backend.ts` | HTTP REST 客户端实现 |
| `hooks.ts` | 生命周期钩子逻辑（自动召回/捕获） |
| `types.ts` | 共享类型定义 |
| `openclaw.plugin.json` | 插件 Manifest |

这种"后端抽象 + HTTP 客户端"的分层模式值得借鉴。mem-feishu-v2 可以采用类似的架构，将飞书 API 客户端和 VikingDB 客户端分别封装，通过统一的 `MemoryService` 层对外提供 CRUD 和搜索能力。

### 2.3 适配状态评估

mem9 已经部分适配了 OpenClaw 的新插件系统——它在 `package.json` 中使用了 `openclaw.extensions` 声明入口，在 `openclaw.plugin.json` 中声明了 `kind: "memory"`。但与官方 `memory-lancedb` 插件相比，mem9 的适配仍有差距：缺少 `additionalProperties: false` 等严格的 Schema 约束，缺少 `install` 元数据和 `minHostVersion` 声明，工具注册仍使用了旧的 factory 模式。

---

## 三、OpenClaw 最新插件系统

### 3.1 核心变更

OpenClaw 在 2026.3.22 版本对插件系统进行了重写。以下是与 mem-feishu-v2 开发直接相关的关键变更：

**插件入口**从直接 `export default` 变为使用 `definePluginEntry()` 包装。这个函数从 `openclaw/plugin-sdk/plugin-entry` 导入，接收一个包含 `id`、`name`、`description`、`kind`、`configSchema` 和 `register` 回调的对象。

**工具注册**从 factory 模式变为直接传入工具对象。新的 `api.registerTool()` 接收一个包含 `name`、`description`、`parameters`（使用 `@sinclair/typebox`）和 `execute` 方法的对象。

**记忆注入**新增了 `api.registerMemoryPromptSection(builder)` 接口，用于将记忆内容注入到 Prompt 的特定位置。这比旧版的 `before_agent_start` 返回 `prependContext` 更加规范。

**Manifest** 文件 `openclaw.plugin.json` 现在承担了更多的声明式配置职责，包括 `configSchema`（JSON Schema 格式）和 `uiHints`（UI 提示）。

### 3.2 官方 memory-lancedb 参考实现

OpenClaw 官方提供的 `memory-lancedb` 插件是最权威的参考实现。它展示了一个完整的 memory 插件应该如何实现：

该插件注册了三个工具：`memory_recall`（搜索记忆）、`memory_store`（存储记忆）、`memory_forget`（删除记忆）。它通过 `before_agent_start` 钩子实现自动召回，通过 `agent_end` 钩子实现自动捕获。自动捕获逻辑只处理用户消息（`role === "user"`），并通过一系列规则过滤器（`shouldCapture`）来决定哪些内容值得存储。

值得注意的是，该插件还实现了 Prompt 注入防护（`looksLikePromptInjection`）和记忆内容转义（`escapeMemoryForPrompt`），这些安全措施 mem-feishu-v2 也应该实现。

### 3.3 社区记忆方案评测

根据社区评测 [1]，OpenClaw 的各种记忆方案可以分为以下几个层级：

| 方案 | 社区评级 | 核心优势 | 核心劣势 |
|------|----------|----------|----------|
| 默认 Markdown | C 级 | 简单 | Token 膨胀严重 |
| Mem0 Plugin | B 级 | 自动化好 | 隐私问题、成本高 |
| Obsidian Vault | B+ 级 | 知识图谱 | 召回速度慢 |
| LanceDB + Lossless Claw | S 级 | 成本低、效果好 | 需要本地向量存储 |

社区的最佳实践共识包括：混合搜索（70% 向量 / 30% 关键词）、MMR 多样性控制、时间衰减、Memory flush 阈值控制等。这些实践为 mem-feishu-v2 的搜索策略设计提供了重要参考。

---

## 四、国内向量数据库服务选型

### 4.1 候选方案

经过调研，以下是适合 mem-feishu-v2 的国内向量数据库云服务：

| 服务 | 厂商 | 内置 Embedding | HTTP API | 混合搜索 | 免费额度 |
|------|------|----------------|----------|----------|----------|
| VikingDB | 火山引擎（字节） | bge-large-zh (1024维) | 是 | 是 | 有 |
| Tablestore | 阿里云 | 需配合通义千问 | 是 | 是 (BM25+向量) | 有 |
| Tencent Cloud VectorDB | 腾讯云 | 需配合腾讯模型 | 是 | 是 | 有限 |

### 4.2 推荐方案：火山引擎 VikingDB

**推荐理由如下：**

VikingDB 是火山引擎（字节跳动）提供的云原生向量数据库服务。它最大的优势在于内置了 `bge-large-zh` Embedding 模型，可以在服务端直接将文本转换为 1024 维向量，客户端无需安装任何 Embedding 模型或调用额外的大模型 API。这完美契合了 Bill 提出的"不在本地做向量运算"的需求。

VikingDB 提供标准的 HTTP API，使用 HMAC-SHA256 签名鉴权，TypeScript 可以通过标准 `fetch` 直接调用，无需安装额外的 SDK 依赖。它支持混合搜索（向量 + 关键词），且有免费体验额度。

此外，Bill 的客户包括字节跳动，使用火山引擎的服务在业务层面也有天然的亲和力。

### 4.3 备选方案：阿里云 Tablestore

阿里云 Tablestore 已经有了与 OpenClaw 的集成方案（`@tablestore/openclaw-mem0`），支持 BM25 + 向量的混合检索。但它需要额外配置通义千问的 Embedding 服务，配置复杂度略高于 VikingDB。

### 4.4 OpenViking 的启示

火山引擎还开源了 [OpenViking](https://github.com/volcengine/OpenViking) 项目，这是一个专为 AI Agent 设计的上下文数据库。它采用"文件系统范式"管理记忆，并提出了 L0/L1/L2 三级上下文加载机制。虽然 mem-feishu-v2 不直接使用 OpenViking，但其三级记忆加载的思路可以借鉴——L0 为始终加载的核心记忆，L1 为按需加载的相关记忆，L2 为深度检索的历史记忆。

---

## 五、关键技术决策总结

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 主存储 | 飞书多维表格 | 可视化管理、用户已有飞书生态 |
| 向量搜索 | 火山引擎 VikingDB | 国内可用、内置 Embedding、无本地依赖 |
| 插件 SDK | OpenClaw 最新版 (>= 2026.3.22) | 必须适配最新插件系统 |
| 参考实现 | 官方 memory-lancedb | 最权威的 memory 插件参考 |
| 搜索策略 | 双模式（轻量/增强） | 降低用户门槛 |
| Embedding 模型 | bge-large-zh (VikingDB 内置) | 服务端生成，无本地依赖 |

---

## 参考资料

[1]: https://www.reddit.com/r/openclaw/comments/1s2574y/ "Reddit: I tested every OpenClaw memory plugin"
[2]: https://github.com/mem9-ai/mem9 "mem9 GitHub"
[3]: https://github.com/openclaw/openclaw/tree/main/extensions/memory-lancedb "OpenClaw memory-lancedb"
[4]: https://www.volcengine.com/product/VikingDB "火山引擎 VikingDB"
[5]: https://github.com/volcengine/OpenViking "OpenViking"
[6]: https://www.alibabacloud.com/help/doc-detail/3025492.html "阿里云 Tablestore OpenClaw 集成"
[7]: https://docs.openclaw.ai/plugins/sdk-entrypoints "OpenClaw Plugin SDK Entry Points"
