# mem-feishu-v2 开发规范与 Trae Rules

> **版本**: v1.1 | **日期**: 2026-03-25 | **作者**: CTO (Manus AI) | **状态**: 开发就绪

---

## 一、文档优先工作流

本项目采用"文档优先"（Documentation-First）的开发工作流。这意味着在 Trae + Claude 的 Vibe Coding 过程中，AI 开发助手的每一步代码生成都必须有官方文档作为依据，严禁基于旧版经验或其他框架的习惯进行臆想。

### 1.1 工作流三步法

每次编写涉及外部 API 或 SDK 的代码时，AI 助手必须遵循以下三个步骤：

**第一步：查阅文档。** 在编写代码前，AI 必须先访问官方文档索引中对应的 URL，阅读最新的 API 签名、参数说明和返回值格式。如果文档索引中没有覆盖到的 API，AI 必须主动搜索官方文档站点。

**第二步：复述依据。** 在生成代码前，AI 必须在思考过程或代码注释中复述其所依赖的官方文档内容。例如："根据飞书 Search Records API 文档，`filter` 参数支持 `conjunction` 和 `conditions` 两个字段，其中 `conditions` 是一个数组..."。

**第三步：编写代码。** 在完成前两步后，AI 才可以开始编写代码。代码中应包含指向文档的注释链接，方便后续维护。

### 1.2 违规处理

如果在代码审查中发现 AI 生成的代码使用了文档中不存在的 API、参数或返回值，该代码段必须被标记为"未验证"并重新生成。这是因为 OpenClaw 的插件系统刚刚经历了重写，旧版 API 已被废弃，而 AI 模型的训练数据可能尚未覆盖最新版本。

---

## 二、官方文档索引

以下是本项目开发过程中必须参考的官方文档入口。这份索引应作为 Trae Rules 的一部分，固定在项目中。

### 2.1 OpenClaw 插件系统（最新版 >= 2026.3.22）

| 文档 | URL | 关键内容 |
|------|-----|----------|
| 架构概览 | `https://docs.openclaw.ai/plugins/architecture` | 插件生命周期、槽位机制 |
| SDK 概览 | `https://docs.openclaw.ai/plugins/sdk-overview` | Registration API 全貌 |
| 入口定义 | `https://docs.openclaw.ai/plugins/sdk-entrypoints` | `definePluginEntry` 用法 |
| Manifest | `https://docs.openclaw.ai/plugins/manifest` | `openclaw.plugin.json` 规范 |
| 迁移指南 | `https://docs.openclaw.ai/plugins/sdk-migration` | 旧版到新版的变更清单 |
| Runtime Helpers | `https://docs.openclaw.ai/plugins/sdk-runtime` | `api.runtime.*` 工具方法 |
| Cron Jobs | `https://docs.openclaw.ai/automation/cron-jobs` | 定时任务机制 |
| 官方 memory-lancedb 源码 | `https://github.com/openclaw/openclaw/tree/main/extensions/memory-lancedb` | 最佳参考实现 |

### 2.2 飞书开放平台（多维表格 Bitable）

| 文档 | URL | 关键内容 |
|------|-----|----------|
| Bitable API 概览 | `https://open.feishu.cn/document/server-docs/docs/bitable-v1/overview` | 整体能力说明 |
| 创建应用 | `https://open.feishu.cn/document/server-docs/docs/bitable-v1/app/create` | Create App API |
| 查询记录 | `https://open.feishu.cn/document/docs/bitable-v1/app-table-record/search` | Search Records API |
| 新增记录 | `https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/create` | Create Record API |
| 批量新增 | `https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/batch_create` | Batch Create API |
| 更新记录 | `https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/update` | Update Record API |
| 删除记录 | `https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/delete` | Delete Record API |
| 添加协作者 | `https://open.feishu.cn/document/server-docs/docs/permission/permission-member/create` | 权限转移 |

### 2.3 火山引擎 VikingDB

| 文档 | URL | 关键内容 |
|------|-----|----------|
| 快速入门 | `https://www.volcengine.com/docs/84313/1254465` | 整体概念和流程 |
| V2 快速入门 | `https://www.volcengine.com/docs/84313/1817051` | 新版 API/SDK |
| Embedding 接口 | `https://www.volcengine.com/docs/84313/1254625` | 内置 Embedding 模型 |
| 数据操作 | `https://www.volcengine.com/docs/84313/1254593` | Collection/Index CRUD |
| API 签名 | `https://www.volcengine.com/docs/6369/67265` | HMAC-SHA256 鉴权 |

---

## 三、代码规范与约束

### 3.1 OpenClaw 插件规范

**导入路径**方面，所有 OpenClaw SDK 的导入必须使用 `openclaw/plugin-sdk/*` 路径。具体来说，插件入口从 `openclaw/plugin-sdk/plugin-entry` 导入 `definePluginEntry`，类型定义从对应的子路径导入。严禁使用已废弃的 `openclaw/plugin-sdk/compat` 路径。

**插件 Manifest** 方面，`openclaw.plugin.json` 必须声明 `"kind": "memory"`，并且 `configSchema` 必须设置 `"additionalProperties": false` 以防止无效配置。所有敏感字段（如 API Key）必须在 `uiHints` 中标记 `"sensitive": true`。

**工具注册**方面，使用 `api.registerTool()` 直接传入工具对象（而非 factory 函数）。参数 Schema 使用 `@sinclair/typebox` 的 `Type.Object()` 定义。工具的 `execute` 方法必须返回 `{ content: [{ type: "text", text: "..." }], details: {...} }` 格式。

**生命周期钩子**方面，使用 `api.on("before_agent_start", handler)` 实现自动召回。使用 `api.on("agent_end", handler)` 实现自动捕获。

**后台服务**方面，使用 `api.registerService()` 启动一个 `setInterval` 定时器，用于飞书和 VikingDB 之间的数据同步兜底。

### 3.2 飞书 API 集成规范

在开发飞书 API 集成时，必须保留指定的语法和接口结构，避免进行可能阻碍未来扩展（如记忆分层或分级功能）的更改。所有飞书 API 调用必须妥善处理限流（Rate Limit，HTTP 429）和权限错误（HTTP 403），并提供清晰的日志输出。

飞书 API 的认证方式采用 `tenant_access_token`，通过 App ID 和 App Secret 获取。Token 有效期为 2 小时，插件需要实现自动刷新机制。**严禁使用 OAuth 2.0 user_access_token 流程**。

在创建新的多维表格 Base 后，必须使用配置中的 `feishu_email` 调用添加协作者 API，赋予用户 `full_access` 权限。

### 3.3 向量数据库集成规范

本项目不使用本地向量数据库（如 LanceDB），所有向量运算和存储均依赖云端服务。VikingDB 的 Embedding 模型为 `bge-large-zh`，输出维度为 1024。在代码中必须明确指定模型名称和维度，不可依赖默认值。

VikingDB API 使用 HMAC-SHA256 签名鉴权，需要在请求头中携带 `Authorization` 字段。插件应封装一个统一的 VikingDB HTTP 客户端，处理签名、重试和错误。

### 3.4 TypeScript 规范

项目使用 ESM（`"type": "module"`），所有相对导入必须带 `.js` 后缀。使用 `@sinclair/typebox` 进行运行时类型校验。所有外部 API 的请求和响应都必须有完整的 TypeScript 类型定义。

---

## 四、Trae Rules 文件

请将 `04-trae-rules.md` 的内容复制到项目根目录的 `.trae/rules` 文件中。

---

## 五、文档验证检查清单

在每次提交代码或完成一个功能模块后，使用以下检查清单进行验证：

| 检查项 | 验证方法 | 通过标准 |
|--------|----------|----------|
| API 文档对齐 | 对比代码中的 API 调用与官方文档 | 所有端点、参数、返回值与文档一致 |
| SDK 导入路径 | grep 搜索 `openclaw/plugin-sdk` | 无 `compat` 路径，全部使用新路径 |
| 类型完整性 | TypeScript 编译检查 | 零 `any` 类型用于外部 API |
| 配置 Schema | 对比 `openclaw.plugin.json` 与代码 | Schema 与运行时解析逻辑一致 |
| 错误处理 | 代码审查 | 飞书 429/403、VikingDB 签名错误均有处理 |
| Token 提取 | 单元测试 | 能正确从飞书 URL 中提取 `app_token` |
| 安全性 | 代码审查 | 无硬编码凭证，支持 `${ENV_VAR}` 语法 |
