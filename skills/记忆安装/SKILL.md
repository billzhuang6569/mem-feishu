# 记忆安装与更新

## 描述

mem-feishu 的一键安装与更新向导。包含：依赖自动修复、飞书记忆库初始化、多维表格所有权移交、OpenClaw 永久化接入、AGENTS.md 写入。

## 触发时机

- 安装：「安装飞书记忆」、「配置记忆插件」、「帮我设置 mem-feishu」
- 更新：「更新飞书记忆」、「升级 mem-feishu」、「mem-feishu 有新版本」

---

## 第零步：判断是全新安装还是更新

```bash
ls mem-feishu/dist/index.js 2>/dev/null && echo "已安装" || echo "未安装"
```

- **未安装** → 执行下方「全新安装」流程（第一步起）
- **已安装** → 跳到「更新」流程

---

## 全新安装流程

### 第一步：克隆代码

根据用户网络环境自动判断（国内用 Gitee，否则用 GitHub）：

```bash
# 国内用户（推荐，速度更快）
git clone https://gitee.com/billzhuang6569/mem-feishu

# 国际用户
# git clone https://github.com/billzhuang6569/mem-feishu
```

如不确定，先尝试 Gitee，失败再尝试 GitHub。

### 第二步：安装依赖（含自动换源修复）

```bash
cd mem-feishu
npm install
```

**如果安装失败，按顺序尝试以下修复方案，直到成功：**

```bash
# 方案 A：切换到国内镜像重试
npm install --registry https://registry.npmmirror.com

# 方案 B：跳过可选依赖（sharp / onnxruntime-node，不影响功能）
npm install --ignore-optional

# 方案 C：两者结合（最宽容）
npm install --registry https://registry.npmmirror.com --ignore-optional
```

成功后构建：

```bash
npm run build
```

### 第三步：创建飞书应用

告诉用户：

> 需要先在飞书开放平台创建一个应用：
> 1. 打开 https://open.feishu.cn/app → 点击「创建企业自建应用」，命名为「AI 记忆助手」
> 2. 进入「凭证与基础信息」，复制 **App ID** 和 **App Secret**
> 3. 进入「权限管理」，开启：`bitable:app`（多维表格）
> 4. 发布版本使权限生效

收集用户的 App ID 和 App Secret。

### 第四步：初始化飞书记忆库

```bash
FEISHU_APP_ID=<AppID> FEISHU_APP_SECRET=<AppSecret> \
  node mem-feishu/dist/index.js setup
```

setup 会自动创建「AI 记忆库」多维表格，输出 App Token 和表格链接。记录输出中的 `FEISHU_APP_TOKEN=xxx`。

如果用户已有多维表格，从飞书 URL 复制 App Token（格式 `Basz...`），加上 `FEISHU_APP_TOKEN=xxx` 重新运行 setup。

### 第五步：移交多维表格所有权

> setup 用应用身份创建了多维表格，移交后用户可在飞书中直接看到并管理。

**自动获取用户 Open ID**：

如果你（Agent）已知当前用户的飞书 Open ID（`ou_xxx`），直接使用。否则询问用户：

> 请提供你的飞书 Open ID（格式：`ou_xxxxxxxx`），或飞书账号邮箱。

```bash
# 使用 Open ID（推荐）
node mem-feishu/dist/index.js transfer-owner --openid <openid>

# 或使用邮箱
node mem-feishu/dist/index.js transfer-owner --email <飞书邮箱>
```

成功后告知用户：多维表格已移交，应用保留编辑权限以持续写入记忆。

### 第六步：注册 OpenClaw 插件

**推荐使用链接模式**，以后更新只需重启，无需重新注册：

```bash
# 链接模式（推荐）
openclaw plugins install -l $(pwd)/mem-feishu/openclaw-plugin

# 或复制模式
# openclaw plugins install mem-feishu/openclaw-plugin
```

### 第七步：写入 OpenClaw 配置

编辑 `~/.openclaw/openclaw.json5`，添加（保留文件中已有内容，只新增这部分）：

```json5
{
  plugins: {
    entries: {
      "mem-feishu": {
        enabled: true,
        config: {
          FEISHU_APP_ID: "<第三步的 App ID>",
          FEISHU_APP_SECRET: "<第三步的 App Secret>",
          FEISHU_APP_TOKEN: "<第四步输出的 App Token>",
          // 国内用户可加速模型下载（可选）：
          // HF_ENDPOINT: "https://hf-mirror.com"
        }
      }
    },
    slots: {
      memory: "mem-feishu"
    }
  }
}
```

### 第八步：将记忆规则写入 AGENTS.md（永久化）

这一步让 Agent 在每次对话中都自动遵守记忆规则：

```bash
AGENTS_FILE="$HOME/.openclaw/AGENTS.md"
mkdir -p "$(dirname "$AGENTS_FILE")"

# 仅在尚未写入时追加（幂等）
if ! grep -q "mem-feishu" "$AGENTS_FILE" 2>/dev/null; then
  cat >> "$AGENTS_FILE" << 'AGENTS_EOF'

## 飞书记忆系统（mem-feishu）

你已连接飞书记忆库，以下规则**始终生效**：

- **主动保存**：用户提到重要决策、偏好、配置、Bug 或解决方案时，调用 `feishu_memory_save` 保存，无需用户提醒
- **主动检索**：用户询问历史信息、或你判断需要上下文时，调用 `feishu_memory_search`
- **自动注入**：每次对话开始，mem-feishu 已自动检索并注入相关记忆，你无需手动触发
- **飞书可视**：所有记忆可在飞书多维表格「AI 记忆库」中直接查看和编辑
AGENTS_EOF
  echo "✓ 已写入 ~/.openclaw/AGENTS.md"
else
  echo "已存在，跳过写入"
fi
```

### 第九步：重启并验证

```bash
openclaw restart 2>/dev/null || true
```

验证：
1. 发送「记住这个：安装完成」→ 应回复「已保存到飞书记忆库 ✓」
2. 发送「我刚才记了什么？」→ 应能回忆起来

两步都成功后告知用户：

> 飞书记忆库已就绪！可在飞书中打开「AI 记忆库」多维表格查看所有记忆。
> 此后每次对话，AI 都会自动记忆和检索，无需任何操作。

---

## 更新流程

### 第一步：拉取最新代码

```bash
cd mem-feishu
git pull
```

如果拉取慢，先切换到 Gitee 源：

```bash
git remote set-url origin https://gitee.com/billzhuang6569/mem-feishu
git pull
```

### 第二步：重新安装依赖并构建

```bash
npm install && npm run build
```

### 第三步：重启

**链接模式**（`-l` 安装）——直接重启即可：

```bash
openclaw restart
```

**复制模式**——需重新注册（趁机升级为链接模式）：

```bash
openclaw plugins uninstall mem-feishu
openclaw plugins install -l $(pwd)/openclaw-plugin
openclaw restart
```

### 验证

询问「mem-feishu 的版本是多少？」，AI 会通过 `feishu_memory_info` 返回版本号确认更新成功。
