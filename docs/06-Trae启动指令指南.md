# Trae 启动指令指南

> **版本**: v2.0 | **日期**: 2026-03-26 | **作者**: CTO (Manus AI) | **状态**: 开发就绪

---

## 一、Trae 规则系统说明

根据 Trae 官方文档 [1]，Trae 的规则系统分为**个人规则**和**项目规则**两类。项目规则以 `.md` 文件的形式存放在 `.trae/rules/` 目录下，通过 YAML front matter 控制生效方式。

我们为 mem-feishu-v2 设计了 **5 个项目规则 + 1 个 Skill**，按职责拆分，避免单个规则文件过于臃肿（Trae 官方建议：如果 Rules 文件太臃肿，应该把工作流指令移到 Skills 中 [2]）。

| 文件名 | 生效方式 | 职责 |
|--------|----------|------|
| `01-core-workflow.md` | **始终生效** | 身份定义、文档优先工作流、通用代码规范 |
| `02-openclaw-sdk.md` | **指定文件生效** | OpenClaw SDK 的导入路径、工具注册、生命周期钩子规范 |
| `03-feishu-api.md` | **指定文件生效** | 飞书 API 鉴权、数据格式、错误处理规范 |
| `04-vikingdb-api.md` | **指定文件生效** | VikingDB 模型、签名、架构规范 |
| `05-research-debug-workflow.md` | **始终生效** | 开发/调试阶段优先使用 `research/` 文档并执行插件诊断清单 |
| `SKILL.md` | **按需调用** | 官方文档索引（OpenClaw / 飞书 / VikingDB 的 URL 清单） |

---

## 二、文件放置方式

在项目根目录下，按以下结构放置文件：

```
mem-feishu-v2/
├── .trae/
│   └── rules/
│       ├── 01-core-workflow.md      ← 始终生效
│       ├── 02-openclaw-sdk.md       ← 编辑 index.ts 等时生效
│       ├── 03-feishu-api.md         ← 编辑 feishu-client.ts 等时生效
│       ├── 04-vikingdb-api.md       ← 编辑 vikingdb-client.ts 等时生效
│       └── 05-research-debug-workflow.md ← 始终生效（开发/调试优先 research）
├── docs/
│   ├── 01-PRD-项目需求与架构设计.md
│   └── 02-开发规范与Trae-Rules.md
└── ...源码文件...
```

**SKILL.md 的导入方式**：在 Trae 中，进入 **Settings -> Rules & Skills -> Skills -> Create**，然后导入 `SKILL.md` 文件。这样当你在对话中提到"查文档"或 Trae 判断需要查阅 API 时，会自动加载文档索引。

---

## 三、准备工作：初始化 Git 仓库

在发送第一条指令前，请确保你已经在本地初始化了 Git 仓库，并关联了远程仓库：

```bash
git init
git add .
git commit -m "Initial commit: docs and rules"
git branch -M main
git remote add origin <你的GitHub仓库地址>
git push -u origin main
```

---

## 四、分阶段开发指令

### M1：初始化与骨架搭建

直接复制粘贴发给 Trae：

```text
我们现在开始开发 mem-feishu-v2 项目。
在开始写代码之前，请你先做以下事情：
1. 阅读 docs/01-PRD-项目需求与架构设计.md，理解项目的整体架构和里程碑。
2. 使用"Official Documentation Index"这个 Skill 查阅 OpenClaw Plugin SDK Entry Points 文档。

确认你理解后，请开始执行【M1: 骨架搭建】：
1. 初始化项目结构（package.json, tsconfig.json），使用 ESM。
2. 编写 openclaw.plugin.json，严格按照 PRD 中的配置结构声明 configSchema。
3. 编写 config.ts，实现配置的解析和校验。
4. 编写 index.ts 的骨架，使用 definePluginEntry，暂时只打印一条初始化日志。
5. 编写 types.ts，定义核心数据类型。

注意：写 OpenClaw 相关代码前，先查文档并复述 API 签名。

完成后执行：
git add .
git commit -m "feat(M1): project skeleton and config parsing"
git push origin main
```

### M2：飞书客户端与核心 CRUD

等 M1 推送到 GitHub 并通过 CTO Review 后：

```text
M1 阶段通过 Review。现在进入【M2: 核心 CRUD】。

请按顺序完成：
1. 使用"Official Documentation Index" Skill 查阅飞书 Bitable API 文档。
2. 编写 feishu-client.ts，封装飞书 API 调用。注意：
   - 使用 tenant_access_token 鉴权并处理自动刷新。
   - 处理 429 限流和 403 权限错误。
   - 日期字段转换为毫秒级时间戳。
3. 编写 setup.ts，实现自动建表和协作者添加逻辑。
4. 编写 memory-service.ts，实现统一的 CRUD 抽象层。
5. 在 index.ts 中注册 memory_store、memory_recall、memory_forget 工具。

先查文档，复述 API 签名，再写代码。

完成后执行：
git add .
git commit -m "feat(M2): feishu client and core CRUD tools"
git push origin main
```

### M3：自动化与兜底同步

等 M2 通过 Review 后：

```text
M2 阶段通过 Review。现在进入【M3: 自动化】。

请完成：
1. 使用"Official Documentation Index" Skill 查阅 OpenClaw Hooks 和 registerService 文档。
2. 编写 capture.ts，实现基于本地规则的自动捕获逻辑（不调用 LLM，只过滤用户消息）。
3. 在 index.ts 中用 api.on("agent_end") 接入自动捕获。
4. 在 index.ts 中用 api.on("before_agent_start") 接入自动召回。
5. 编写 sync.ts，实现飞书与 VikingDB 的同步逻辑骨架。
6. 在 index.ts 中用 api.registerService() 启动每 4 小时执行一次的兜底同步。

写代码前，确认 OpenClaw Hook 的 event 结构。

完成后执行：
git add .
git commit -m "feat(M3): auto-capture, auto-recall, and background sync"
git push origin main
```

### M4：向量增强

等 M3 通过 Review 后：

```text
M3 阶段通过 Review。现在进入【M4: 向量增强】。

请完成：
1. 使用"Official Documentation Index" Skill 查阅 VikingDB Embedding API 和 API Signing 文档。
2. 编写 vikingdb-client.ts，封装 VikingDB HTTP 调用，内置 HMAC-SHA256 签名逻辑。
3. 完善 memory-service.ts，实现双写逻辑（同时写飞书和 VikingDB）。
4. 完善搜索逻辑：先从 VikingDB 查向量相似的 record_id，再从飞书拉最新内容。VikingDB 报错或未开启时，自动降级为飞书关键词搜索。

VikingDB 模型硬编码为 bge-large-zh，维度 1024。

完成后执行：
git add .
git commit -m "feat(M4): vikingdb integration and vector search"
git push origin main
```

---

## 五、为什么这样设计

**规则拆分**的好处在于：当 Trae 编辑 `feishu-client.ts` 时，只加载飞书相关的规则，不会被 VikingDB 的规则干扰，节省上下文窗口。核心的"文档优先"规则始终生效，确保每次对话都遵守。

**文档索引做成 Skill** 而非 Rule 的好处在于：文档 URL 列表很长，如果始终加载会浪费 Token。做成 Skill 后，只在需要查文档时按需加载。

**分阶段指令**的好处在于：每个阶段末尾的 `git push` 确保代码及时同步到 GitHub，CTO 可以随时拉取代码进行 Review，确认没问题后再进入下一阶段。

---

## 参考资料

[1]: https://docs.trae.ai/ide/rules "Trae Rules 官方文档"
[2]: https://www.trae.ai/blog/trae_tutorial_0115 "Best Practices for Agent Skills in TRAE"
