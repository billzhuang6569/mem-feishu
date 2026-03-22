---
name: mem-feishu-setup
description: 安装和更新 mem-feishu 飞书记忆插件，将 AI 记忆自动存入飞书多维表格
version: 1.0.0
homepage: https://github.com/billzhuang6569/mem-feishu
---

# mem-feishu 安装与更新

## 触发时机

- 安装：「安装飞书记忆」「配置记忆插件」「帮我设置 mem-feishu」
- 更新：「更新飞书记忆」「升级 mem-feishu」「mem-feishu 有新版本」

---

## Step 0：检测安装状态

```bash
ls dist/index.js 2>/dev/null && echo INSTALLED || echo NOT_INSTALLED
```

- **NOT_INSTALLED** → 执行下方「安装流程」
- **INSTALLED** → 跳到「更新流程」

---

## 安装流程

### Step 1：克隆代码

```bash
git clone https://github.com/billzhuang6569/mem-feishu && cd mem-feishu
```

### Step 2：安装依赖并构建

```bash
bash install.sh
```

> 首次运行会下载约 80MB AI 嵌入模型（用于本地向量搜索），终端会显示下载进度。如网络较慢请耐心等待。

### Step 3：创建飞书应用

告诉用户：

> 需要先在飞书开放平台创建一个应用：
> 1. 打开 https://open.feishu.cn/app → 点击「创建企业自建应用」，命名为「AI 记忆助手」
> 2. 进入「凭证与基础信息」，复制 **App ID** 和 **App Secret**
> 3. 进入「权限管理」，搜索并开启：`bitable:app`（多维表格读写）
> 4. 发布一个版本使权限生效

收集用户的 App ID 和 App Secret 后继续。

### Step 4：初始化飞书记忆库

```bash
FEISHU_APP_ID=<AppID> FEISHU_APP_SECRET=<AppSecret> node dist/index.js setup
```

setup 会自动创建「AI 记忆库」多维表格。记录输出中的 `FEISHU_APP_TOKEN=xxx`。

### Step 5：移交多维表格所有权

> setup 用应用身份创建了多维表格，移交后用户可在飞书中直接查看和管理。

```bash
# 使用邮箱
node dist/index.js transfer-owner --email <飞书邮箱>

# 或使用 Open ID
node dist/index.js transfer-owner --openid <ou_xxx>
```

### Step 6：注册 OpenClaw 插件

```bash
openclaw plugins install -l $(pwd)/openclaw-plugin
```

### Step 7：写入 OpenClaw 配置

编辑 `~/.openclaw/openclaw.json5`，在 plugins 部分添加（保留已有内容）：

```json5
{
  plugins: {
    entries: {
      "mem-feishu": {
        enabled: true,
        config: {
          FEISHU_APP_ID: "<Step 3 的 App ID>",
          FEISHU_APP_SECRET: "<Step 3 的 App Secret>",
          FEISHU_APP_TOKEN: "<Step 4 输出的 App Token>"
        }
      }
    },
    slots: {
      memory: "mem-feishu"
    }
  }
}
```

### Step 8：写入 AGENTS.md

```bash
AGENTS_FILE="$HOME/.openclaw/AGENTS.md"
mkdir -p "$(dirname "$AGENTS_FILE")"
grep -q "mem-feishu" "$AGENTS_FILE" 2>/dev/null || cat >> "$AGENTS_FILE" << 'EOF'

## 飞书记忆系统（mem-feishu）

你已连接飞书记忆库，以下规则始终生效：
- 用户提到重要决策、偏好、配置时，调用 feishu_memory_save 保存
- 用户询问历史或需要上下文时，调用 feishu_memory_search
- 每次对话开始，记忆已自动注入，无需手动触发
EOF
```

### Step 9：重启并验证

```bash
openclaw restart
```

发送「记住这个：安装完成」验证保存功能是否正常。

### Step 10：完成

告知用户：

> 飞书记忆库已就绪！你可以在飞书中打开「AI 记忆库」多维表格查看所有记忆。
> 此后每次对话，AI 都会自动记忆和检索，无需任何操作。

---

## 更新流程

```bash
cd mem-feishu && git pull && bash install.sh && openclaw restart
```

链接模式安装（`-l`）无需重新注册插件。
