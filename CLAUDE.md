# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

mem-feishu 是一个为 [OpenClaw](https://openclaw.ai) 设计的 AI 记忆插件，将 AI 对话记忆存储在飞书多维表格（Bitable）中，并通过本地 SQLite 向量库（sqlite-vec）实现语义搜索。

## 常用命令

```bash
npm run build        # 编译 TypeScript（src/ -> dist/）
npm run dev          # 开发模式，直接运行 ts 源码（tsx）
npm start            # 生产模式，运行编译后的 dist/index.js

# CLI 子命令（开发时用 npm run dev -- <command>）
node dist/index.js save -c "内容" [-t tag1,tag2] [-s source] [-p project]
node dist/index.js search -q "查询词" [-l 5] [--format]
node dist/index.js recent [-l 10] [--format]
node dist/index.js setup      # 初始化飞书多维表格
node dist/index.js info       # 显示飞书表格链接
node dist/index.js transfer-owner --email user@example.com

# 端到端测试（需设置环境变量）
bash test/e2e.sh
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `FEISHU_APP_ID` | 是 | 飞书应用 App ID |
| `FEISHU_APP_SECRET` | 是 | 飞书应用 App Secret |
| `GOOGLE_API_KEY` | 是（搜索功能） | Google AI API Key，用于 Embedding 向量化 |
| `FEISHU_APP_TOKEN` | 可选 | 多维表格 App Token（`setup` 命令可自动创建） |
| `FEISHU_TABLE_NAME` | 可选 | 表格名称，默认 `AI 记忆库` |
| `https_proxy` | 可选 | HTTP 代理，`src/vector/embed.ts` 中 undici 自动读取 |

运行时生成的持久化配置缓存在 `data/config.json`（gitignored）。

## 架构概览

项目分为两层，解耦清晰：

**Core 层**（`src/`）：独立的 TypeScript CLI，不依赖任何 AI 平台
- `src/feishu/` — 飞书 Bitable SDK 封装（CRUD、表格初始化、record 查询）
- `src/memory/` — 业务逻辑层（save/search/recent/format）
- `src/vector/` — 本地向量引擎（sqlite-vec ANN 搜索 + Google Embedding API）
- `src/index.ts` — CLI 入口（commander 路由）

**适配层**（`openclaw-plugin/`）：OpenClaw 插件，通过 `child_process.execFileSync` 调用 Core CLI，不直接 import Core 模块

### 数据流

**保存记忆（`save`）：**
```
save → bitable.addRecord()         → 飞书 API（写入记录，返回 record_id）
     → embed()                     → Google Embedding API（文本 -> 768 维向量）
     → db.upsertVector()           → 本地 SQLite vec0 表（key = record_id）
```

**搜索记忆（`search`）：**
```
search → embed(query)              → Google API（query -> 向量）
       → db.vectorSearch()         → SQLite ANN 搜索（返回 record_ids）
       → bitable.getRecordsByIds() → 飞书 API（用 record_id 补全完整记录）
```

### 双存储策略

- **飞书 Bitable**：存正文和元数据（标签/来源/状态/项目/时间），提供可视化管理
- **本地 SQLite + sqlite-vec**：存向量索引，`vec0` 表的 key 为飞书 `record_id`，两者通过 record_id 关联

### OpenClaw 插件行为

| 时机 | 行为 |
|------|------|
| 新对话开始（`command:new` / `session_start`） | 注入最近 5 条记忆到系统上下文 |
| 对话结束（`agent_end`） | 自动保存最后一条 assistant 消息（>=100 字时，截取前 500 字） |

## 关键类型

飞书表格字段（`src/feishu/types.ts`）：记忆ID（UUID）、内容、标签（多选）、来源（单选）、状态（活跃/暂停/归档/已删除）、项目、创建时间。

`Memory` TypeScript 类型包含 `recordId?: string`，对应飞书的 record_id，是向量库与飞书记录的关联 key。

## 注意事项

- `openclaw-plugin/` 有自己独立的 `package.json`，其 TypeScript 源码由 OpenClaw 运行时直接加载，无独立构建步骤
- `data/` 目录为 gitignored，包含本地 SQLite 数据库和配置缓存，不要提交
- 向量库的 key 必须与飞书 record_id 保持一致，删除记录时需同步清理向量库
- 修改飞书表格字段名时，需同步更新 `src/feishu/types.ts` 中的字段名映射常量
