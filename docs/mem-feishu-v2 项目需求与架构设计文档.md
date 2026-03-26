# mem-feishu-v2 项目需求与架构设计文档

> **版本**: v1.3 | **日期**: 2026-03-25 | **作者**: CTO (Manus AI) | **状态**: 待确认

---

## 一、项目概述

### 1.1 项目定位

**mem-feishu-v2** 是一个专为 OpenClaw 开发的记忆增强插件（Memory Plugin）。它将 AI Agent 的记忆从本地 Markdown 文件迁移到飞书多维表格，并结合云端向量数据库实现语义检索，从而为每一个 AI Agent 提供一个可持久化、可管理、可共享的记忆层。

### 1.2 核心痛点

OpenClaw 默认的记忆机制依赖于 Agent 自行编写的 Markdown 文件，存在以下三个核心痛点：

| 痛点 | 现状 | mem-feishu-v2 解决方案 |
|------|------|------------------------|
| **记忆分级缺失** | 所有记忆平铺在 Markdown 中，无法区分永久/临时/垃圾内容 | 飞书多维表格提供 `category`（分类）和 `importance`（重要性评分）字段，支持记忆分级 |
| **记忆关联缺失** | 记忆之间没有连接，无法发现用户行为的共性 | 通过 `tags`（标签）字段建立记忆关联，通过向量相似度发现隐性关联 |
| **管理与查阅困难** | Markdown 文件散落在部署根目录，无法方便地查看和编辑 | 飞书多维表格天然提供可视化界面，支持筛选、排序、编辑、共享 |

### 1.3 灵感来源

本项目的灵感来自 [mem9](https://github.com/mem9-ai/mem9) 项目。mem9 为 OpenClaw 提供了一个基于 TiDB Cloud 的记忆后端，但其依赖海外云服务（TiDB Cloud、OpenAI Embedding），国内用户使用不便。mem-feishu-v2 采用飞书多维表格 + 火山引擎 VikingDB 的全国产化方案，解决了这一问题。

---

## 二、核心设计理念

### 2.1 极简配置与跨实例复用（配置缓存法）

**痛点**：用户在多个 OpenClaw 实例安装插件时，重复建表和配置非常繁琐。

**解决方案**：基于本地配置缓存的自动发现机制。
1. 用户只需在配置中提供飞书自建应用的 `app_id` 和 `app_secret`。
2. 插件首次启动时，自动调用飞书 API 创建名为 `OpenClaw-Memory-Base` 的多维表格。
3. 创建成功后，将返回的 `app_token` 永久保存在 OpenClaw 的本地插件配置文件中。
4. 以后每次启动，插件直接读取配置中的 `app_token`，无需搜索。
5. 如果用户在另一台电脑安装，只需把这个 `app_token` 填入配置即可实现跨实例复用。
6. **Agent 隔离**：在同一个 Base 中，根据 `agent_id` 自动创建或匹配对应的 Table（如 `Table-Agent-A`）。

### 2.2 轻量级自动捕获（避免性能损耗）

**痛点**：如果每次对话结束都调用 LLM 总结记忆，会造成严重的性能问题和 Token 浪费。

**解决方案**：采用轻量级的本地规则过滤策略。
1. 在 `agent_end` hook 中，只提取用户的消息（避免 Agent 自我中毒）。
2. 使用轻量级的本地规则（正则/关键词）进行初步过滤（如检测"记住"、"我喜欢"、邮箱等模式）。
3. 只有当用户明确表达了偏好、事实或使用了特定句式时，才将其作为记忆捕获。
4. 这样完全不消耗额外的 LLM 算力，性能极高。

### 2.3 智能安装与引导流程

**痛点**：插件安装后，用户不知道如何配置，特别是老用户如何复用已有的记忆库。

**解决方案**：
1. 编写一个专门的 `install-guide.md`，托管在 GitHub 上。
2. 用户只需发送一条类似 `curl -s https://example.com/install.md | openclaw run` 的命令。
3. Agent 读取这个 Markdown 文件后，会变成一个"安装向导"：
   - 询问用户是新用户还是老用户。
   - 新用户：引导提供 App ID/Secret，自动建表。
   - 老用户：引导提供之前的 App Token 或多维表格网址，插件内置正则自动提取 Token。

### 2.4 协作者模式的权限管理

**痛点**：应用（Bot）创建的多维表格，用户无法直接在飞书客户端编辑。

**解决方案**：
1. 插件在配置中增加一个可选的 `feishu_email` 字段（用户飞书注册邮箱）。
2. 插件创建 Base 后，直接调用飞书"添加协作者" API，传入 `member_type: "email"`。
3. 赋予该邮箱对应的用户 `full_access` 权限。
4. 这样用户就可以在飞书客户端完全掌控自己的记忆库。

---

## 三、技术架构设计

### 3.1 系统架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    OpenClaw Host                         │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │           mem-feishu-v2 Plugin                   │    │
│  │                                                  │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │    │
│  │  │  Tools   │  │  Hooks   │  │ Local Filter │  │    │
│  │  │ recall   │  │ before_  │  │ (正则/关键词) │  │    │
│  │  │ store    │  │ agent_   │  │              │  │    │
│  │  │ setup    │  │ start    │  │              │  │    │
│  │  │ sync     │  │ agent_   │  │              │  │    │
│  │  │          │  │ end      │  │              │  │    │
│  │  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │    │
│  │       │              │               │          │    │
│  │  ┌────┴──────────────┴───────────────┴───────┐  │    │
│  │  │         Memory Service Layer              │  │    │
│  │  │  (统一的记忆 CRUD + 搜索抽象层)            │  │    │
│  │  └────────┬──────────────────┬───────────────┘  │    │
│  │           │                  │                   │    │
│  └───────────┼──────────────────┼───────────────────┘    │
│              │                  │                         │
└──────────────┼──────────────────┼─────────────────────────┘
               │                  │
     ┌─────────▼────────┐  ┌─────▼──────────────┐
     │  飞书多维表格     │  │  火山引擎 VikingDB  │
     │  (主存储/SoT)    │  │  (向量索引/可选)    │
     │  CRUD + 关键词    │  │  Embedding + 搜索   │
     └──────────────────┘  └────────────────────┘
```

### 3.2 存储层设计（飞书多维表格）

飞书多维表格作为主存储（Source of Truth）。每个 Agent 对应一张数据表，数据表结构如下：

| 字段名 | 飞书字段类型 | 说明 | 备注 |
|--------|-------------|------|------|
| `memory_id` | 文本 (1) | 记忆唯一标识 (UUID) | 由插件生成 |
| `content` | 文本 (1) | 记忆内容 | 核心字段 |
| `category` | 单选 (3) | 分类标签 | preference / fact / decision / entity / other |
| `importance` | 数字 (2) | 重要性 (0-1) | 用于排序和过滤 |
| `tags` | 多选 (4) | 关联标签 | 用于建立记忆关联 |
| `source` | 单选 (3) | 来源 | auto-capture / manual / tool-call |
| `agent_id` | 文本 (1) | 所属 Agent ID | 用于多 Agent 隔离 |
| `vector_id` | 文本 (1) | VikingDB 中的向量 ID | 增强模式下使用 |
| `created_at` | 日期 (5) | 创建时间 | 必须使用毫秒级时间戳 |
| `updated_at` | 日期 (5) | 更新时间 | 必须使用毫秒级时间戳 |
| `expires_at` | 日期 (5) | 过期时间 | 可选，必须使用毫秒级时间戳 |

### 3.3 向量检索层设计（火山引擎 VikingDB）

项目采用**火山引擎 VikingDB** 作为首选向量方案。其核心优势在于**内置 Embedding 能力**。插件只需将文本发送到 VikingDB 的 `/api/data/embedding` 接口，VikingDB 会使用内置的 `bge-large-zh` 模型在服务端生成 1024 维向量并存储。客户端完全不需要安装任何 Embedding 模型。

### 3.4 数据同步策略（双重兜底机制）

为了保证飞书多维表格（用户可能手动编辑）和 VikingDB（向量索引）之间的数据一致性，采用以下策略：

1. **Agent 写入时（实时）**：插件同时写入飞书和 VikingDB（双写），保证实时一致。
2. **Agent Cron 任务（主同步）**：在安装指引中，让 Agent 创建一个每天凌晨执行的 Cron Job，调用 `mem_feishu_sync` 工具进行全量同步。
3. **插件后台服务（兜底同步）**：插件在初始化时，利用 `registerService` 启动一个轻量级的 `setInterval` 定时器（如每 4 小时），作为 Cron 任务可能被误删的兜底保障。
4. **搜索时校验**：在 Agent 执行搜索时，先从 VikingDB 查出匹配的 `record_id`，然后再从飞书拉取这些记录的最新内容。如果发现不一致，以飞书为准，并后台更新 VikingDB。

### 3.5 容错与错误处理机制

插件的任何错误都不能导致主 Agent 崩溃，且必须将错误信息反馈给 Agent：
- **凭证无效**：捕获 400/403 错误，返回给 Agent："飞书凭证无效或未开启多维表格权限，请检查飞书开发者后台配置。"
- **表格丢失**：捕获 404 错误，触发"自动发现/重建"流程，重新创建 Base/Table，并通知 Agent。
- **字段不匹配**：在初始化或捕获错误时，调用获取字段列表 API，对比缺失字段并自动补全。
- **VikingDB 异常**：向量化或搜索超时/报错时，自动降级为"轻量模式"（仅飞书关键词搜索），并通知 Agent 提醒用户。

---

## 四、配置设计

### 4.1 插件配置结构

```json
{
  "feishu": {
    "appId": "cli_xxx",
    "appSecret": "xxx",
    "appToken": "basexxx", // 自动缓存，用户也可手动填入以跨实例复用
    "adminEmail": "user@example.com" // 可选，用于自动添加协作者
  },
  "vikingdb": {
    "enabled": false,
    "accessKeyId": "AKxxx",
    "accessKeySecret": "xxx",
    "host": "api-vikingdb.volces.com",
    "collectionName": "mem_feishu_memories",
    "embeddingModel": "bge-large-zh"
  },
  "autoCapture": true,
  "autoRecall": true,
  "recallLimit": 5,
  "recallMinScore": 0.3
}
```

---

## 五、开发里程碑

| 阶段 | 内容 | 预估工作量 |
|------|------|-----------|
| **M1: 骨架搭建** | 插件入口、配置解析、飞书 API 客户端封装 | 2-3 天 |
| **M2: 核心 CRUD** | memory_store / memory_recall / setup 工具实现 | 3-4 天 |
| **M3: 自动化** | Auto-Recall 和基于本地规则的 Auto-Capture 实现 | 2-3 天 |
| **M4: 向量增强** | VikingDB 集成、双写同步机制、双模式切换 | 3-4 天 |
| **M5: 测试与发布** | 单元测试、集成测试、安装向导文档、npm 发布 | 2-3 天 |

---

## 参考资料

[1]: https://www.reddit.com/r/openclaw/comments/1s2574y/ "Reddit: I tested every OpenClaw memory plugin so you don't have to"
[2]: https://docs.openclaw.ai/plugins/architecture "OpenClaw Plugin Architecture"
[3]: https://docs.openclaw.ai/plugins/sdk-runtime "OpenClaw Plugin Runtime Helpers"
[4]: https://open.feishu.cn/document/server-docs/docs/bitable-v1/app/create "飞书多维表格创建 API"
[5]: https://www.volcengine.com/docs/84313/1254625 "火山引擎 VikingDB Embedding API"
