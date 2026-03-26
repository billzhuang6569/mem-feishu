# CTO 综合修复指令：解决安装与运行时的 4 个遗留问题

Bill，针对你反馈的 4 个问题，我已经完成了代码和流程的审查。这些问题都不是底层架构问题，而是**安装脚本、提示词和配置注入**的细节遗漏。

请让 AI 开发团队按照以下指令进行修复：

---

## 问题 1：`Cannot find module '@sinclair/typebox'` 依赖缺失

**根因分析**：
这是因为 `install.sh` 脚本只在项目根目录执行了 `npm install`，而 `@sinclair/typebox` 是声明在 `openclaw-plugin/package.json` 里的。OpenClaw 注册插件时会读取 `openclaw-plugin` 目录，但该目录下的依赖没有被安装。

**修复方案**：
修改根目录的 `install.sh`，增加对子目录依赖的安装。

**修改 `install.sh`**：
```bash
#!/bin/bash
set -e
echo "检测网络环境..."
if curl -s --max-time 3 https://registry.npmjs.org > /dev/null 2>&1; then
  echo "使用 npm 官方源安装..."
  npm install
  # 新增：安装插件目录依赖
  cd openclaw-plugin && npm install && cd ..
else
  echo "官方源不可达，切换到 npmmirror 镜像..."
  npm install --registry https://registry.npmmirror.com
  # 新增：安装插件目录依赖
  cd openclaw-plugin && npm install --registry https://registry.npmmirror.com && cd ..
fi
npm run build
echo "✓ 安装完成"
```

---

## 问题 2：Agent 只返回 Token ID，不返回完整 URL

**根因分析**：
`dist/index.js setup` 命令其实**已经**在终端里打印了完整的 URL（`直接链接：https://feishu.cn/base/Basz...`）。
但 Agent 之所以只给你发 ID，是因为 `skills/记忆安装/SKILL.md` 里的提示词（Step 4）写得不好，误导了 Agent。

**修复方案**：
修改 `skills/记忆安装/SKILL.md` 的 Step 4，明确要求 Agent 把完整链接发给用户。

**修改 `skills/记忆安装/SKILL.md` 的 Step 4**：
```markdown
### Step 4：初始化飞书记忆库

```bash
cd ~/mem-feishu
FEISHU_APP_ID=<AppID> FEISHU_APP_SECRET=<AppSecret> node dist/index.js setup
```

setup 命令会自动创建「AI 记忆库」多维表格，并在输出中提供 App Token 和直接链接。

> **重要指令给 Agent**：
> 必须向用户展示**完整的飞书多维表格直接链接**（格式为 `https://feishu.cn/base/xxxx`），而不仅仅是 Token ID。
> 告诉用户："飞书多维表格已创建！你可以点击这个链接查看：[链接]"
```

---

## 问题 3：首次安装时 Agent 找不到 SKILL 文件

**根因分析**：
在 README.md 的「一句话安装」提示词中，我们让 Agent 去读 `skills/记忆安装/SKILL.md`，但没有明确告诉它这个文件是在**刚刚克隆下来的 `mem-feishu` 目录里**。Agent 可能会在全局找，找不到就懵了。

**修复方案**：
修改 `README.md` 中的一句话安装提示词，加上绝对路径。

**修改 `README.md` 的「一句话安装」部分**：
```markdown
**国内用户（Gitee，推荐）：**

帮我安装飞书记忆插件：git clone https://gitee.com/billzhuang6569/mem-feishu ~/mem-feishu && cd ~/mem-feishu && bash install.sh，然后严格按照 ~/mem-feishu/skills/记忆安装/SKILL.md 文件中的引导，一步步带我完成所有设置。

**国际用户（GitHub）：**

Help me install the mem-feishu plugin: git clone https://github.com/billzhuang6569/mem-feishu ~/mem-feishu && cd ~/mem-feishu && bash install.sh, then strictly follow the guide in ~/mem-feishu/skills/记忆安装/SKILL.md to walk me through the setup step by step.
```

---

## 问题 4：`400 Missing access token` 错误

**根因分析**：
这个错误不是因为代码里没写获取 token 的逻辑，而是因为 **OpenClaw 的插件配置没有正确注入**。
在你的日志里，Agent 试图用 `openclaw config set plugins.entries.mem-feishu.config...` 来注入配置，但 OpenClaw 插件在启动时，如果没有读到 `FEISHU_APP_TOKEN`，它在执行后台初始化（`backend.ensureReady()`）时就会报错。

另外，`FeishuMemoryBackend.ts` 的构造函数里有一段逻辑：
```typescript
this.appToken = config.FEISHU_APP_TOKEN ?? this._readLocalAppToken() ?? '';
if (!this.appToken) {
  throw new Error('[mem-feishu] 缺少 FEISHU_APP_TOKEN，请先运行 setup 命令');
}
```
如果用户还没运行 setup，或者配置还没注入，插件一加载就会崩溃。

**修复方案**：
允许 `appToken` 在初始化时为空，把检查推迟到真正调用飞书 API 的时候。

**修改 `src/backend/FeishuMemoryBackend.ts`**：
1. 移除构造函数中对 `appToken` 的强校验：
```typescript
// 修改前：
this.appToken = config.FEISHU_APP_TOKEN ?? this._readLocalAppToken() ?? '';
if (!this.appToken) {
  throw new Error('[mem-feishu] 缺少 FEISHU_APP_TOKEN，请先运行 setup 命令');
}

// 修改后：
this.appToken = config.FEISHU_APP_TOKEN ?? this._readLocalAppToken() ?? '';
// 移除 throw Error，允许为空，因为 setup 阶段可能还没生成 token
```

2. 在所有需要调用飞书 API 的私有方法（如 `_ensureTable`, `_getTableId`, `store`, `listRecent` 等）开头，增加动态检查：
```typescript
private _requireAppToken(): string {
  const token = this.appToken || this._readLocalAppToken();
  if (!token) {
    throw new Error('未配置 FEISHU_APP_TOKEN。请先运行 setup 命令或在 OpenClaw 中配置。');
  }
  return token;
}
```
然后在发请求时使用 `this._requireAppToken()` 替代 `this.appToken`。

这样，插件在 OpenClaw 启动时即使没有 Token 也能正常加载，只有在真正读写记忆时才会报错提示用户配置。
