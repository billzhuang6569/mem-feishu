# OpenClaw 插件与 Hook 系统开发与排错指南（基于 mem-feishu-v2）

## 一、背景与目标

OpenClaw 已在 2026 年重构了插件与自动化 Hook 体系：插件统一通过 `openclaw.plugin.json` 与 `package.json` 中的 `openclaw` 字段声明能力；自动化 Hook 则通过标准目录结构与 `HOOK.md` 元数据进行发现和管理。

mem-feishu-v2 是一个基于飞书多维表格的 Memory 插件，其工程结构中已经包含 `openclaw.plugin.json` 与 TypeScript 源码，但在安装时遭遇 CLI 报错：`Error: HOOK.md missing in /root/.openclaw/extensions/mem-feishu-v2/HOOK.md`。该错误表面上与文件缺失有关，实质则与 `openclaw.hooks` 的配置格式不匹配有关。

本文档面向插件开发团队，系统梳理：

- OpenClaw 最新插件体系的核心概念与文件规范
- Hook 与 Hook Pack 的目录结构、`HOOK.md` 格式及运行机制
- 对 mem-feishu-v2 安装错误的根因分析
- 针对该类问题的修复方案与统一开发规范 / Checklist


## 二、OpenClaw 插件体系总览

### 2.1 插件的基本构成

一个“原生” OpenClaw 插件至少由两类元数据构成：

1. `package.json`
   - 指定包名、版本、构建产物等
   - 通过 `openclaw` 字段声明入口文件、可选的 Hook Pack 等（下节展开）
2. `openclaw.plugin.json`
   - **插件清单（manifest）**，仅用于“发现 + 配置校验”，不会参与运行时代码注册
   - 最少字段：`id` 和 `configSchema`；可选字段包括 `name`、`description`、`kind`（如 `"memory"`）、`providers`、`channels`、`skills`、`uiHints` 等。

mem-feishu-v2 的 `openclaw.plugin.json`：

```json
{
  "id": "mem-feishu-v2",
  "name": "mem-feishu-v2",
  "description": "Feishu Bitable memory plugin for OpenClaw",
  "kind": "memory",
  "uiHints": { ... },
  "configSchema": { ... }
}
```

已经符合 manifest 要求，并通过 `kind: "memory"` 声明自己是一个 Memory 插件，可被 `plugins.slots.memory` 选中。

相应的 `package.json` 则负责：模块类型（`"type": "module"`）、构建产物（`"main": "dist/index.js"`、`"types": "dist/index.d.ts"`）、打包文件列表（`"files": ["dist", "openclaw.plugin.json"]`）等。


### 2.2 `package.json` 中的 `openclaw` 字段

官方“构建插件”文档给出的最小示例为：

```json
{
  "name": "@myorg/openclaw-my-plugin",
  "version": "1.0.0",
  "type": "module",
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}
```

要点：

- `openclaw.extensions`：
  - 数组，每个元素是 **插件入口文件** 的相对路径（ESM 模块），OpenClaw 会加载并执行这些入口。
  - 对于已经编译到 `dist` 的插件，可使用 `"extensions": ["dist/index.js"]`。
- `openclaw.hooks`：
  - **不是插件入口**，而是“Hook Pack 描述”，用于通过 `openclaw plugins install` 安装 Hook 包时告诉 CLI 去哪些目录寻找 Hook 目录（见第 4 节）。

因此：

- 插件运行时能力（channel、provider、tools、hooks 等）由入口文件中的 `definePluginEntry` 注册。
- 自动化 Hook（命令 / 会话 / 网关事件驱动）由 Hook 目录 + `HOOK.md` + `handler.*` 提供，并通过 `openclaw.hooks` 或本地目录发现机制加载。


### 2.3 插件入口与注册 API

典型的非渠道插件入口示例：

```ts
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";

export default definePluginEntry({
  id: "my-plugin",
  name: "My Plugin",
  description: "Adds a custom tool to OpenClaw",
  register(api) {
    api.registerTool({
      name: "my_tool",
      description: "Do a thing",
      parameters: Type.Object({ input: Type.String() }),
      async execute(_id, params) {
        return { content: [{ type: "text", text: `Got: ${params.input}` }] };
      },
    });
  },
});
```

关键点：

- 使用 `definePluginEntry`（或 `defineChannelPluginEntry`），使 OpenClaw 在加载入口模块时能正确识别插件类型。
- 通过 `api.registerTool`、`api.registerProvider`、`api.registerChannel`、`api.registerHook` 等注册不同能力。
- **插件级别 `registerHook` 与自动化 Hook(`HOOK.md` + `handler.ts`) 是两个不同层次：**
  - `registerHook` 是插件 SDK 暴露的“同步 Hook API”，例如对工具结果做二次处理。
  - 自动化 Hook 则是面向命令、会话、消息、网关等事件的异步脚本系统（本指南重点）。


## 三、Hook 与 Hook Pack 体系

### 3.1 Hook 的层级与发现机制

OpenClaw 将 Hook 分为四个来源，按优先级顺序为：

1. **自带（bundled hooks）**：随 OpenClaw 发布，路径形如 `<openclaw>/dist/hooks/bundled/`。
2. **插件内置 Hook（plugin hooks）**：随插件一起分发的 Hook，作为插件能力的一部分。
3. **托管 Hook（managed hooks）**：`~/.openclaw/hooks/` 及 `hooks.internal.load.extraDirs` 所指定的目录。
4. **工作区 Hook（workspace hooks）**：`<workspace>/hooks/`，仓库本地 Hook，默认禁用，需要显式 enable。

每个 Hook 实体都是一个目录：

```text
my-hook/
├── HOOK.md          # 元数据 + 文档
└── handler.ts       # 实现（或 index.ts / .js）
```

通过 CLI：

- `openclaw hooks list`：查看所有被发现的 Hook。
- `openclaw hooks enable <name>`：启用指定 Hook。


### 3.2 `HOOK.md` 格式

`HOOK.md` 采用 YAML frontmatter + Markdown 正文结构：

```markdown
---
name: my-hook
description: "Short description of what this hook does"
homepage: https://docs.openclaw.ai/automation/hooks#my-hook
metadata:
  { "openclaw": { "emoji": "🔗", "events": ["command:new"], "requires": { "bins": ["node"] } } }
---

# My Hook

详细文档...
```

要点：

- `name`：Hook 对外展示名称；若缺省，则使用目录名作为 Hook 名。
- `metadata.openclaw.events`：声明监听的事件（如 `command:new`、`gateway:startup` 等）。
- 其余字段（`emoji`、`requires` 等）用于 CLI 展示与资格校验，不影响安装错误“HOOK.md missing”的触发。


### 3.3 Hook Pack 与 `openclaw.hooks`

自动化文档中，Hook Pack 被定义为“通过 `package.json` 的 `openclaw.hooks` 暴露一个或多个 Hook 目录的 npm 包”：

```json
{
  "name": "@acme/my-hooks",
  "version": "0.1.0",
  "openclaw": {
    "hooks": ["./hooks/my-hook", "./hooks/other-hook"]
  }
}
```

官方约定：

- `openclaw.hooks` **每一项都是一个目录路径**（相对于包根目录），而不是 `HOOK.md` 文件本身。
- 目录内必须包含：
  - `HOOK.md`
  - `handler.ts` / `handler.js` / `index.ts` / `index.js` 至少其一。
- Hook Pack 安装时，OpenClaw 会将这些 Hook 复制到 `~/.openclaw/hooks/<id>` 下运行。


### 3.4 CLI 安装流水线中的 HOOK 验证逻辑

`src/hooks/install.ts` 中定义了 Hook Pack 的安装与验证逻辑，核心步骤如下：

1. 从 `packageDir` 读取 `package.json`，校验是否存在 `openclaw.hooks` 且为非空数组：

   ```ts
   async function ensureOpenClawHooks(manifest) {
     const hooks = manifest[MANIFEST_KEY]?.hooks;
     if (!Array.isArray(hooks)) {
       throw new Error("package.json missing openclaw.hooks");
     }
     const list = hooks.map((e) => (typeof e === "string" ? e.trim() : ""))
       .filter(Boolean);
     if (list.length === 0) {
       throw new Error("package.json openclaw.hooks is empty");
     }
     return list;
   }
   ```

2. 对每个 `entry`（即 `openclaw.hooks` 中的元素），计算 Hook 目录：

   ```ts
   const hookDir = path.resolve(params.packageDir, entry);
   ```

   - 此处明确假设 `entry` 是 **目录路径**，而非 `HOOK.md` 文件路径。

3. 校验目录内是否存在 `HOOK.md` 与 handler 文件：

   ```ts
   async function validateHookDir(hookDir: string): Promise<void> {
     const hookMdPath = path.join(hookDir, "HOOK.md");
     if (!(await runtime.fileExists(hookMdPath))) {
       throw new Error(`HOOK.md missing in ${hookDir}`);
     }

     const handlerCandidates = ["handler.ts", "handler.js", "index.ts", "index.js"];
     const hasHandler = await Promise.all(
       handlerCandidates.map(async (candidate) => runtime.fileExists(path.join(hookDir, candidate))),
     ).then((results) => results.some(Boolean));

     if (!hasHandler) {
       throw new Error(`handler.ts/handler.js/index.ts/index.js missing in ${hookDir}`);
     }
   }
   ```

4. 解析 Hook 名称：

   ```ts
   async function resolveHookNameFromDir(hookDir: string): Promise<string> {
     const hookMdPath = path.join(hookDir, "HOOK.md");
     if (!(await runtime.fileExists(hookMdPath))) {
       throw new Error(`HOOK.md missing in ${hookDir}`);
     }
     const raw = await fs.readFile(hookMdPath, "utf-8");
     const frontmatter = parseFrontmatter(raw);
     return frontmatter.name || path.basename(hookDir);
   }
   ```

若 `hookDir` 计算错误（例如变成了 `.../HOOK.md` 这个“文件路径”），则 `path.join(hookDir, "HOOK.md")` 会变成 `.../HOOK.md/HOOK.md`，自然找不到文件，从而抛出如下一致错误：

> `HOOK.md missing in /actual/hookDir`

这也是 mem-feishu-v2 报错路径中重复出现 `HOOK.md` 的根本原因。


## 四、mem-feishu-v2 工程结构与问题复盘

### 4.1 仓库结构与插件元数据

当前 GitHub 仓库根目录结构大致为：

- `index.ts`、`capture.ts`、`config.ts` 等插件源码
- `openclaw.plugin.json`：Memory 插件 manifest（见第 2.1 节）
- `package.json`：
  - `"main": "dist/index.js"`
  - `"types": "dist/index.d.ts"`
  - `"files": ["dist", "openclaw.plugin.json"]`
  - 未在仓库 HEAD 中看到 `openclaw` 字段，但题述配置信息显示本地版本包含：

    ```jsonc
    "openclaw": {
      "extensions": ["dist/index.js"],
      "hooks": ["HOOK.md"]
    }
    ```

题述还给出运行时安装路径：

- 插件安装目录：`/root/.openclaw/extensions/mem-feishu-v2/`
- 其中存在：`HOOK.md` 文件，内容类似：

  ```markdown
  # Plugin Hooks - setup: mem_feishu_setup
  ```

  （注意：该内容不符合 YAML frontmatter 要求，稍后会给出建议修订。）


### 4.2 安装时报错路径解读

报错为：

> `Error: HOOK.md missing in /root/.openclaw/extensions/mem-feishu-v2/HOOK.md`

结合 CLI 源码可推断出当时内部状态为：

1. `packageDir`（安装时的包根目录）约为：`/root/.openclaw/extensions/mem-feishu-v2`。
2. `openclaw.hooks` 中的某个 `entry` 为：`"HOOK.md"`。
3. 于是：

   ```ts
   const hookDir = path.resolve(packageDir, entry);
   // => /root/.openclaw/extensions/mem-feishu-v2/HOOK.md
   const hookMdPath = path.join(hookDir, "HOOK.md");
   // => /root/.openclaw/extensions/mem-feishu-v2/HOOK.md/HOOK.md
   ```

4. 系统实际存在的文件路径是：`/root/.openclaw/extensions/mem-feishu-v2/HOOK.md`（即包根目录下的文件），但 CLI 正在检查的是 `HOOK.md/HOOK.md`，因此 `fileExists` 失败，抛出：

   ```ts
   throw new Error(`HOOK.md missing in ${hookDir}`);
   // => HOOK.md missing in /root/.openclaw/extensions/mem-feishu-v2/HOOK.md
   ```

5. 这也解释了为什么 **“明明有 HOOK.md 文件，仍然报 HOOK.md missing”**：
   - 有：`/root/.../HOOK.md`
   - 查：`/root/.../HOOK.md/HOOK.md`

归根结底，这是因为 `openclaw.hooks` 被错误地配置成了指向 `HOOK.md` 文件本身，而非其所在目录。CLI 逻辑按照“目录 + 固定文件名 HOOK.md”的约定在工作，因此产生了错位。


### 4.3 二级潜在问题：handler 文件缺失

即便修正了 `openclaw.hooks` 的路径，使 `hookDir` 变成真正的目录（例如包根目录 `.`），下一步 `validateHookDir` 还会检查是否存在如下任一文件：

- `handler.ts`
- `handler.js`
- `index.ts`
- `index.js`

安装后的插件目录一般只包含构建产物：

- `dist/index.js`（插件入口）

而包根目录下 **不一定有** `handler.ts` 或 `index.js`。如果：

- 将 `openclaw.hooks` 改成 `"."`，但根目录仍然只有 `HOOK.md` 而没有上述 handler 文件；

则安装流程会在下一步抛出：

> `handler.ts/handler.js/index.ts/index.js missing in /root/.openclaw/extensions/mem-feishu-v2`

因此，完整修复方案必须同时满足：

1. `openclaw.hooks` 的 entry 是目录路径；
2. 对应目录中存在 `HOOK.md` 与 handler 文件之一。


## 五、推荐修复方案与目录规范

本节给出两个可选、且对团队易于推广的修复方案，并在最后抽象出统一规范。

### 5.1 方案 A：单独 hooks 子目录（推荐）

**目标：** 将自动化 Hook 与插件入口逻辑解耦，用独立的 `hooks/` 目录承载 `mem_feishu_setup`，兼容后续扩展多个 Hook。

#### 5.1.1 目录结构建议

在插件仓库中新增：

```text
hooks/
  mem-feishu-setup/
    HOOK.md
    handler.ts
```

`HOOK.md` 示例（简化版，可按需扩展）：

```markdown
---
name: mem-feishu-setup
description: "Initialize Feishu Bitable config and validate environment for mem-feishu-v2"
metadata:
  openclaw:
    emoji: "🪪"
    events: ["gateway:startup"]
---

# mem-feishu-setup

当 Gateway 启动时，检查 Feishu / VikingDB 所需的环境变量与配置，并输出诊断信息。
```

`handler.ts` 示例骨架：

```ts
// hooks/mem-feishu-setup/handler.ts

const handler = async (event: any) => {
  if (event.type !== "gateway" || event.action !== "startup") {
    return;
  }

  // 这里可以检查 env / config，并写入日志或 messages
  console.log("[mem-feishu-setup] Gateway startup, validating Feishu config...");

  // TODO: 调用插件导出的某个初始化函数，或直接发起一次轻量 API 探针
};

export default handler;
```

然后在 `package.json` 中增加 `openclaw` 字段（或修正现有版本）：

```jsonc
{
  "name": "mem-feishu-v2",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "openclaw": {
    "extensions": ["dist/index.js"],
    "hooks": ["./hooks/mem-feishu-setup"]
  },
  "files": [
    "dist",
    "openclaw.plugin.json",
    "hooks"            // 确保发布到 npm / ClawHub 时包含 hooks 目录
  ]
}
```

这样：

- 安装时 `hookDir = path.resolve(packageDir, "./hooks/mem-feishu-setup")`，是一个真实目录；
- CLI 检查到 `hookDir/HOOK.md` 与 `hookDir/handler.ts`，通过校验；
- Hook Pack 与插件入口逻辑清晰分层，后期若要新增其他自动化行为（如基于命令 / 消息事件），可在同一 `hooks/` 下新增子目录并扩展 `openclaw.hooks` 数组。

#### 5.1.2 注意事项

- 若通过 `openclaw plugins install .` 本地路径安装且使用 `--link`，`files` 字段对安装无影响，但发布到 npm / ClawHub 时必须确保 `hooks/` 被包含。
- Hook 的事件选择：
  - 若仅做一次性的环境检查，适合监听 `gateway:startup`。
  - 若要在 `/new` 或 `/reset` 之后做同步 / 导出，可监听 `command:new` / `command:reset`。


### 5.2 方案 B：包根目录作为 Hook 目录（最小改动）

**目标：** 在不新增子目录的前提下，让当前安装路径 `.../mem-feishu-v2/HOOK.md` 直接作为 Hook 目录被识别。

#### 5.2.1 调整步骤

1. 将 `openclaw.hooks` 改为指向根目录：

   ```jsonc
   "openclaw": {
     "extensions": ["dist/index.js"],
     "hooks": ["."]
   }
   ```

   这样 `hookDir = path.resolve(packageDir, ".")` 即为 `/root/.openclaw/extensions/mem-feishu-v2`。

2. 在包根目录新增 handler 文件，例如 `handler.ts`：

   ```ts
   // handler.ts at repo root
   const handler = async (event: any) => {
     if (event.type !== "gateway" || event.action !== "startup") {
       return;
     }

     console.log("[mem-feishu-setup] Gateway startup, running root-level hook...");
   };

   export default handler;
   ```

3. 修改 `HOOK.md` 为合法 frontmatter：

   ```markdown
   ---
   name: mem-feishu-setup
   description: "Setup hook for mem-feishu-v2"
   metadata:
     openclaw:
       emoji: "🦞"
       events: ["gateway:startup"]
   ---

   # mem-feishu-setup

   简要说明该 Hook 的作用和依赖。
   ```

4. 若通过 npm 分发，需要在 `files` 中加入 `HOOK.md` 与 `handler.*`：

   ```jsonc
   "files": [
     "dist",
     "openclaw.plugin.json",
     "HOOK.md",
     "handler.js"  // 或 TypeScript 运行环境允许的话，直接 "handler.ts"
   ]
   ```

#### 5.2.2 风险与权衡

- 优点：改动少，沿用当前 `/extensions/mem-feishu-v2/HOOK.md` 的位置关系。
- 风险：将“插件入口逻辑”与“自动化 Hook”混在包根目录，后期扩展多个 Hook 时代码易变得凌乱；建议仅在短期内使用，长期仍推荐迁移到方案 A 的 `hooks/` 结构。


### 5.3 针对团队的统一规范（插件 + Hook）

综合官方文档与上述分析，建议团队对所有 OpenClaw 插件统一采用以下规范：

1. **Manifest 与包元数据**
   - `openclaw.plugin.json` 必须存在，且至少包含：
     - `id`（与包名解耦，但建议保持合理对应）
     - `configSchema`（即使为空，也应给出 `{ "type": "object", "additionalProperties": false }`）。
   - `package.json`：
     - 声明 `"type": "module"` 与构建产物位置（`main`、`types`）。
     - 使用 `"openclaw": { "extensions": ["dist/index.js"] }` 指定入口模块。

2. **Hook Pack 相关**
   - **只在确实需要自动化 Hook 时**添加 `openclaw.hooks`；否则不要配置此字段，避免 CLI 将插件误解为 Hook Pack。
   - 若配置 `openclaw.hooks`：
     - 每一项必须是“目录路径”，指向含有 `HOOK.md` 和 handler 的目录，例如 `"./hooks/mem-feishu-setup"`。
     - 禁止写成 `"HOOK.md"` 或具体文件名。
   - 每个 Hook 目录必须包含：
     - `HOOK.md`：合法 YAML frontmatter + Markdown 正文。
     - 至少一个 handler 文件：`handler.ts` / `handler.js` / `index.ts` / `index.js`。

3. **发布与安装路径**
   - 若需经 npm / ClawHub 分发，`files` 字段必须覆盖：
     - `dist`（插件运行时代码）
     - `openclaw.plugin.json`
     - 所有 Hook 目录或根级 `HOOK.md` 与 handler 文件。
   - 本地开发调试推荐用：
     - `openclaw plugins install -l .`（link 模式）或
     - 在 `plugins.load.paths` 中添加源码路径，避免每次 build+publish。

4. **命名与事件约定**
   - Hook 名称建议统一前缀：`mem-feishu-xxx`，与插件 id 呼应，便于 `openclaw hooks list` 中识别来源。
   - 尽量在 `metadata.openclaw.events` 中声明具体事件（如 `"command:new"`），避免使用泛化的 `"command"`，减轻性能开销。


## 六、调试与诊断建议

为方便团队今后排查此类安装 / 运行问题，建议形成如下调试流程：

### 6.1 安装阶段（CLI 侧）

1. 安装时加上 Dry Run：

   ```bash
   openclaw plugins install ./mem-feishu-v2 --dry-run --verbose
   ```

   - 可提前看到 `openclaw.hooks` 的解析结果以及潜在错误，而不真正写入状态目录。

2. 使用 `plugins inspect` 核对记录：

   ```bash
   openclaw plugins inspect mem-feishu-v2 --json
   ```

   - 检查：
     - 插件来源（本地 / npm / ClawHub）
     - `Format: openclaw` 还是 bundle
     - 是否存在 Hook 相关信息（"hook-only" / "hybrid-capability" 等）。


### 6.2 Hook 发现与运行阶段

1. 检查 Hook 是否被发现：

   ```bash
   openclaw hooks list --verbose
   ```

   - 确认是否出现自定义 Hook 名称（如 `mem-feishu-setup`），以及其来源（bundled / plugin / managed / workspace）。

2. 查看单个 Hook 详情与资格：

   ```bash
   openclaw hooks info mem-feishu-setup --json
   ```

   - 若不 eligible，可从输出中看到缺失的 env / bin / config 等条件。

3. 观察 Gateway 日志：

   - macOS 示例脚本：`./scripts/clawlog.sh -f`
   - 其他平台：`tail -f ~/.openclaw/gateway.log`

   在日志中搜索 `hook` 或特定 Hook 名称以确认加载与执行情况。


### 6.3 常见错误模式对照

结合本次 mem-feishu-v2 案例，可以整理出以下高频错误模式与对应排查思路：

| 错误信息（示例）                                                         | 可能原因                                                   | 建议检查项                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------- |
| `HOOK.md missing in /path/to/some/dir`                                   | `openclaw.hooks` entry 指向错误目录或目录下缺少 HOOK.md    | entry 是否为目录路径；目录下是否存在 HOOK.md   |
| `HOOK.md missing in /path/to/.../HOOK.md`（路径末尾带 HOOK.md）          | entry 被错误写成 `"HOOK.md"`，导致 `hookDir` 指向文件路径 | 将 entry 改成 `"."` 或 `"./hooks/..."`      |
| `handler.ts/handler.js/index.ts/index.js missing in /path/to/hook-dir`   | Hook 目录下缺少 handler 文件                              | 新增 handler.ts / index.ts 等                  |
| `package.json missing openclaw.hooks` 或 `openclaw.hooks is empty`       | 试图安装 Hook Pack，但未在 package.json 中声明 hooks       | 是否真的需要 Hook Pack；如需则补齐 openclaw.hooks |
| `invalid hook name: ...` 或 `path traversal detected`                    | hookId / entry 含非法字符或试图越界                       | 避免在 entry 中使用 `..`、绝对路径等           |
| `plugin disabled (memory slot set to "memory-core") but config is present` | 当前 memory 槽位仍绑定内置 `memory-core`                  | 执行 `openclaw config set plugins.slots.memory mem-feishu-v2` 后重启 Gateway |


## 七、结论与后续建议

1. **本次 mem-feishu-v2 安装错误的直接根因，是将 `openclaw.hooks` 配置成了指向 `HOOK.md` 文件本身，违背了“entry 必须是 Hook 目录”的约定，导致 CLI 在 `.../HOOK.md/HOOK.md` 处查找文件，从而抛出 `HOOK.md missing`。**
2. **若仅修正 entry 但不补充 handler 文件，将在下一步遭遇 handler 缺失错误，因此修复方案必须同时满足“entry 为目录路径 + 目录中存在 HOOK.md 与 handler”。**
3. 推荐团队采用“方案 A：`hooks/` 子目录 + 规范化 `HOOK.md` + handler.ts”作为统一模式，使自动化 Hook 与插件入口解耦，便于扩展与维护。
4. 在所有后续插件开发中，应严格区分：
   - `openclaw.plugin.json`：只负责配置校验与发现；
   - `package.json.openclaw.extensions`：插件入口文件；
   - `package.json.openclaw.hooks`：Hook Pack 目录列表，而非单个 HOOK.md 文件。
5. 对于 `kind: "memory"` 的第三方插件，安装后需显式检查 `plugins.slots.memory` 是否已切换到目标插件 id；否则会出现“插件存在但被槽位禁用”的误判。
6. 团队可将本文第 5–6 节整理为内部模板与 Checklist，配合 `openclaw plugins`、`openclaw hooks` 等 CLI 子命令在 CI 中做基础验证，显著降低类似安装 / 兼容性问题的排查成本。
