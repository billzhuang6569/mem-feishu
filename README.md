# mem-feishu-v2

专为 OpenClaw 开发的记忆增强插件，使用飞书多维表格作为持久化存储，结合火山引擎 VikingDB 提供强大的语义向量检索能力。

## 核心特性

- **双模式存储**：支持轻量模式（仅飞书，关键词搜索）和增强模式（飞书 + VikingDB，语义向量搜索）。
- **零配置复用**：基于飞书 App ID 自动发现和复用记忆库，跨 Agent 自动隔离数据表。
- **无感自动捕获**：基于本地规则引擎，在对话结束时自动提取关键记忆（偏好、事实、决策等），不消耗额外 LLM 算力。
- **智能上下文注入**：每次对话前，自动根据当前 Prompt 召回最相关的历史记忆，实现真正的"记忆增强"。
- **双重同步机制**：支持后台定时同步，确保飞书多维表格的手动修改能实时同步到向量数据库。

## 记忆分类

插件会自动将捕获的记忆分为以下几类：
- `preference`: 用户偏好（如：喜欢深色模式、习惯用 Python）
- `fact`: 客观事实（如：用户的公司名称、项目背景）
- `decision`: 历史决策（如：之前决定采用的架构方案）
- `entity`: 实体信息（如：邮箱、电话、API Key）
- `other`: 其他有价值的上下文

## 安装与配置

### 1. 准备工作

**飞书自建应用：**
1. 访问 [飞书开发者后台](https://open.feishu.cn/app/)，创建企业自建应用。
2. 获取 `App ID` 和 `App Secret`。
3. 在"添加应用能力"中添加"机器人"能力。
4. 在"权限管理"中申请以下权限：
   - `bitable:app:read` (查看多维表格)
   - `bitable:app:write` (编辑多维表格)
   - `drive:drive:read` (查看云空间文件)
   - `drive:drive:write` (编辑云空间文件)
   - `drive:permission:read` (查看云空间权限)
   - `drive:permission:write` (编辑云空间权限)
5. 发布应用版本。

**火山引擎 VikingDB（可选，用于增强模式）：**
1. 访问 [火山引擎 VikingDB 控制台](https://console.volcengine.com/vikingdb/)。
2. 获取 `API Key` (AK) 和 `Secret Key` (SK)。
3. 创建一个 Collection，并记录 `Collection Name` 和 `Index Name`。

### 2. 插件安装

在 OpenClaw 中运行以下命令安装插件：

```bash
/plugin install mem-feishu-v2
```

安装后，Agent 会自动引导你完成配置，包括：
1. 填写飞书凭证（App ID, App Secret）
2. 填写飞书注册邮箱（用于自动将你添加为记忆库的管理员）
3. （可选）填写 VikingDB 凭证

## 架构设计

本插件采用纯 OpenClaw 插件架构（`definePluginEntry`），不依赖外部 CLI 或子进程。

- **主存储**：飞书多维表格（提供可视化管理界面）
- **向量检索**：火山引擎 VikingDB（服务端 Embedding，无需本地依赖）
- **同步策略**：双写 + 启动同步 + 兜底定时同步

详细的设计文档请参考 `docs/` 目录。

## 开发指南

本项目采用"文档优先"的 AI 辅助开发工作流（Trae + Claude）。

1. 克隆仓库：`git clone https://github.com/billzhuang6569/mem-feishu.git -b v2`
2. 安装依赖：`npm install`
3. 编译构建：`npm run build`
4. 类型检查：`npm run typecheck`

开发规范和 Trae Rules 请参考 `docs/02-开发规范与Trae-Rules.md` 和 `.trae/rules/` 目录。

## 许可证

MIT License
