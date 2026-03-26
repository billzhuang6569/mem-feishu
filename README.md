# mem-feishu-v2

**为 OpenClaw AI Agent 提供飞书多维表格驱动的持久化记忆层。**

mem-feishu-v2 是一个 OpenClaw 插件，它将 AI Agent 的记忆存储到用户自己的飞书多维表格中，并可选接入火山引擎 VikingDB 实现语义向量搜索。用户可以在飞书中直接查看、编辑、管理和共享 Agent 的记忆。

## 核心特性

| 特性 | 说明 |
|------|------|
| 飞书多维表格存储 | 记忆数据存储在用户自己的飞书 Base 中，可视化管理 |
| 记忆分级 | 支持 preference / fact / decision / entity / other 五级分类 |
| 自动捕获 | 对话结束后自动提取有价值的记忆 |
| 自动召回 | 新对话开始时自动加载相关记忆 |
| 向量搜索（可选） | 接入 VikingDB 实现语义搜索，降级为关键词搜索 |
| 一键安装 | Agent 引导式安装，非开发者也能轻松配置 |

## 项目结构

```
mem-feishu-v2/
├── .trae/rules/          # Trae AI 编码规则（4 个精准规则文件）
├── docs/                 # 项目文档（PRD、开发规范、技术调研、启动指南）
│   ├── 01-PRD-项目需求与架构设计.md
│   ├── 02-开发规范与Trae-Rules.md
│   ├── 03-技术调研报告.md
│   ├── 05-讨论要点与待决策项.md
│   ├── 06-Trae启动指令指南.md
│   └── SKILL.md          # Trae Skill：官方文档索引
├── index.ts              # 插件入口
├── config.ts             # 配置解析
├── feishu-client.ts      # 飞书 API 客户端
├── vikingdb-client.ts    # VikingDB 客户端（可选）
├── memory-service.ts     # 统一记忆 CRUD 抽象层
├── capture.ts            # 自动捕获逻辑
├── sync.ts               # 后台同步逻辑
├── setup.ts              # 安装引导
├── types.ts              # 类型定义
└── openclaw.plugin.json  # 插件清单
```

## 开发

本项目使用 Trae + Claude 进行 Vibe Coding 开发。开发流程和指令详见 `docs/06-Trae启动指令指南.md`。

## License

MIT
