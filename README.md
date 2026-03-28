# mem-feishu-v2

专为 OpenClaw 开发的记忆增强插件。使用飞书多维表格作为持久化存储，结合火山引擎 VikingDB 提供语义向量检索能力。让你的 AI Agent 真正拥有长期记忆，并且记忆就在你自己的飞书里——可查看、可编辑、可共享。

## 一句话安装

**复制下面这段文字，直接发送给你的 OpenClaw Agent：**

> 请帮我安装 mem-feishu-v2 记忆增强插件。请先阅读安装指南，然后按步骤执行：
>
> ```
> curl -fsSL https://raw.githubusercontent.com/billzhuang6569/mem-feishu/v2/install-guide.md
> ```
>
> 请获取上述 URL 的内容，然后严格按照其中的步骤帮我完成安装和配置。

发送后，Agent 会自动完成以下所有操作：
1. 克隆仓库并编译插件
2. 将插件注册到 OpenClaw
3. 引导你提供飞书凭证
4. 自动创建多维表格记忆库
5. 将你添加为记忆库管理员

整个过程你只需要回答 Agent 的几个问题即可。

---

## 核心特性

**双模式存储**：支持轻量模式（仅飞书，关键词搜索）和增强模式（飞书 + VikingDB，语义向量搜索）。轻量模式零外部依赖，开箱即用；增强模式提供真正的语义理解能力。

**无感自动捕获**：基于本地规则引擎，在每次对话结束时自动提取关键记忆（偏好、事实、决策、实体信息等），完全不消耗额外 LLM 算力。

**智能上下文注入**：每次对话开始前，自动根据当前 Prompt 召回最相关的历史记忆并注入上下文，实现真正的"记忆增强"。

**可视化管理**：所有记忆存储在你自己的飞书多维表格中。你可以随时在飞书客户端中查看、编辑、删除、甚至与团队共享 Agent 的记忆。

**多 Agent 隔离**：同一个飞书 Base 中，每个 Agent 自动拥有独立的数据表，互不干扰。

**双重同步机制**：后台定时同步 + 启动时全量校验，确保飞书中的手动修改能及时同步到向量数据库。

## 记忆分类

插件会自动将捕获的记忆分为以下几类：

| 分类 | 说明 | 示例 |
|------|------|------|
| `preference` | 用户偏好 | "喜欢深色模式"、"习惯用 Python" |
| `fact` | 客观事实 | "用户的公司名称"、"项目背景" |
| `decision` | 历史决策 | "之前决定采用的架构方案" |
| `entity` | 实体信息 | "邮箱地址"、"API Key" |
| `other` | 其他有价值的上下文 | 无法归类但值得记住的信息 |

## 手动安装

如果你更习惯手动操作，也可以按以下步骤安装：

### 前置准备：创建飞书自建应用

1. 访问 [飞书开发者后台](https://open.feishu.cn/app/)，创建企业自建应用。
2. 获取 `App ID` 和 `App Secret`。
3. 在"添加应用能力"中添加"机器人"能力。
4. 在"权限管理"中申请以下权限并发布版本：

| 权限 | 用途 |
|------|------|
| `bitable:app` | 创建和管理多维表格 |
| `drive:drive` | 访问云空间文件 |
| `drive:permission` | 管理文件权限（添加协作者） |

### 安装步骤

```bash
# 1. 克隆仓库
cd ~/.openclaw/extensions/
git clone https://github.com/billzhuang6569/mem-feishu.git -b v2 mem-feishu-v2

# 2. 安装依赖并编译
cd mem-feishu-v2
npm install --include=dev
npm run build

# 3. 注册插件
openclaw plugins install -l ~/.openclaw/extensions/mem-feishu-v2

# 4. 重启 Gateway
openclaw gateway restart
```

安装完成后，在对话中告诉 Agent 你的飞书凭证，Agent 会调用 `mem_feishu_setup` 工具自动完成建表和配置。

### VikingDB 增强模式（可选）

如果需要语义向量搜索能力：

1. 访问 [火山引擎 VikingDB 控制台](https://console.volcengine.com/vikingdb/)。
2. 获取 `Access Key` (AK) 和 `Secret Key` (SK)。
3. 创建 Collection 和 Index，记录 `Collection Name` 和 `Index Name`。
4. 在插件配置中启用 VikingDB 并填入上述凭证。

## 架构设计

本插件采用纯 OpenClaw 插件架构（`definePluginEntry`），不依赖外部 CLI 或子进程。

| 组件 | 技术选型 | 职责 |
|------|---------|------|
| 主存储 | 飞书多维表格 | 记忆的持久化存储和可视化管理 |
| 向量检索 | 火山引擎 VikingDB | 服务端 Embedding（bge-large-zh），语义搜索 |
| 自动捕获 | 本地规则引擎 | 对话结束时提取记忆，不消耗 LLM |
| 上下文注入 | OpenClaw Hook | 对话开始前自动召回并注入相关记忆 |
| 后台同步 | registerService | 定时校验飞书与 VikingDB 的数据一致性 |

详细的设计文档请参考 `docs/` 目录。

## 开发指南

本项目采用"文档优先"的 AI 辅助开发工作流（Trae + Claude）。

```bash
git clone https://github.com/billzhuang6569/mem-feishu.git -b v2
cd mem-feishu
npm install
npm run build
npm run typecheck
```

开发规范和 Trae Rules 请参考 `docs/02-开发规范与Trae-Rules.md` 和 `.trae/rules/` 目录。

## 许可证

MIT License
