# mem-feishu

以飞书多维表格为存储后端的 AI 记忆层，为 OpenClaw 提供持久化记忆能力，支持本地向量搜索。

## 架构

```
OpenClaw（通过 registerContextEngine + registerTool）
        ↓
openclaw-plugin/（适配层，薄）
        ↓ 调用 CLI
src/（Core 层，完全独立）
    ↙              ↘
飞书 Bitable      本地 SQLite + sqlite-vec
（可视化 + 存储）   （向量搜索索引）
```

**解耦设计**：Core 层不依赖任何 agent，未来接入其他平台只需增加新的适配层。

## OpenClaw 集成

| 机制 | 作用 |
|------|------|
| `registerContextEngine.assemble()` | 每次构建 prompt 前，向量搜索相关记忆 → 自动注入系统上下文 |
| `registerContextEngine.ingest()` | 会话结束时，自动将 assistant 回复保存到飞书 |
| `feishu_memory_save` tool | LLM 主动调用，将用户要求记住的内容精炼后保存 |
| `feishu_memory_search` tool | LLM 主动调用，向量搜索历史记忆 |
| `feishu_memory_recent` tool | LLM 主动调用，获取最近记忆列表（可选工具）|

插件以 `kind: "memory"` 注册，通过 `plugins.slots.memory: "mem-feishu"` 设为活跃记忆引擎。

## 安装

参考 `skills/记忆安装/SKILL.md`，或在 OpenClaw 中说「安装记忆」由 AI 引导。

## 环境变量

| 变量 | 说明 |
|------|------|
| `FEISHU_APP_ID` | 飞书应用的 App ID |
| `FEISHU_APP_SECRET` | 飞书应用的 App Secret |
| `FEISHU_APP_TOKEN` | 多维表格的 Base App Token |
| `FEISHU_TABLE_NAME` | 表格名称（默认：`AI 记忆库`） |

## CLI 命令（Core 层，独立可用）

```bash
node dist/index.js save --content "内容" --tags "决策,配置" --source "openclaw"
node dist/index.js search --query "关键词" --limit 10
node dist/index.js recent --limit 20
node dist/index.js setup   # 初始化飞书多维表格
```

## 飞书多维表格字段

| 字段 | 类型 | 说明 |
|------|------|------|
| **记忆ID** | 文本（第一字段）| 唯一标识，向量库关联 key |
| 内容 | 多行文本 | 记忆正文 |
| 标签 | 多选 | 分类标签 |
| 来源 | 单选 | openclaw / 手动 |
| 状态 | 单选 | 活跃 / 暂停 / 归档 / 已删除 |
| 项目 | 文本 | 项目目录名 |
| 创建时间 | 日期 | 记录写入时间 |
