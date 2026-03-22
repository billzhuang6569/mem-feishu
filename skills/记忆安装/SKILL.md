---
name: mem-feishu-setup
description: 安装和更新 mem-feishu 飞书记忆插件，将 AI 记忆自动存入飞书多维表格
version: 1.0.0
homepage: https://github.com/billzhuang6569/mem-feishu
---

# mem-feishu 安装与更新

## 触发时机

- 安装：「安装飞书记忆」「配置记忆插件」「帮我设置 mem-feishu」
- 更新：「更新飞书记忆」「升级 mem-feishu」
- 卸载：「卸载飞书记忆」「移除 mem-feishu」

---

## Step 0：检测安装状态

```bash
ls ~/mem-feishu/dist/index.js 2>/dev/null && echo INSTALLED || echo NOT_INSTALLED
```

- **NOT_INSTALLED** → 执行下方「安装流程」
- **INSTALLED** → 跳到「更新流程」
- 用户说「卸载」→ 跳到「卸载流程」

---

## 安装流程

### Step 1：克隆代码

```bash
cd ~ && git clone https://github.com/billzhuang6569/mem-feishu && cd mem-feishu
```

### Step 2：安装依赖并构建

```bash
bash install.sh
```

> `install.sh` 会自动检测网络选择 npm 源（官方/国内镜像），完成后显示「✓ 安装完成」。

### Step 3：创建飞书应用

告诉用户：

> 需要先在飞书开放平台创建一个应用：
> 1. 打开 https://open.feishu.cn/app → 点击「创建企业自建应用」，命名为「AI 记忆助手」
> 2. 进入「凭证与基础信息」，复制 **App ID** 和 **App Secret**
> 3. 进入「权限管理」，搜索并开启：`bitable:app`（多维表格读写）
> 4. 发布一个版本使权限生效

收集用户的 App ID 和 App Secret 后继续。

### Step 4：获取 Google API Key

告诉用户：

> mem-feishu 使用 Google Embedding API 进行语义搜索，需要一个 Google AI API Key：
> 1. 打开 https://aistudio.google.com/apikey
> 2. 点击「Create API Key」，选择一个 Google 项目（或新建）
> 3. 复制生成的 API Key（格式：`AIza...`）

收集用户的 Google API Key 后继续。

### Step 5：初始化飞书记忆库

```bash
cd ~/mem-feishu
FEISHU_APP_ID=<AppID> FEISHU_APP_SECRET=<AppSecret> node dist/index.js setup
```

setup 会自动创建「AI 记忆库」多维表格。记录输出中的 `FEISHU_APP_TOKEN=xxx`。

### Step 6：移交多维表格所有权

```bash
# 使用邮箱
FEISHU_APP_ID=<AppID> FEISHU_APP_SECRET=<AppSecret> FEISHU_APP_TOKEN=<Token> \
  node dist/index.js transfer-owner --email <飞书邮箱>

# 或使用 Open ID
FEISHU_APP_ID=<AppID> FEISHU_APP_SECRET=<AppSecret> FEISHU_APP_TOKEN=<Token> \
  node dist/index.js transfer-owner --openid <ou_xxx>
```

### Step 7：注册 OpenClaw 插件

```bash
openclaw plugins install -l ~/mem-feishu/openclaw-plugin
```

### Step 8：写入 OpenClaw 配置

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
          FEISHU_APP_TOKEN: "<Step 5 输出的 App Token>",
          GOOGLE_API_KEY: "<Step 4 的 Google API Key>"
        }
      }
    },
    slots: {
      memory: "mem-feishu"
    }
  }
}
```

### Step 9：智能写入 AGENTS.md

```bash
AGENTS_FILE="$HOME/.openclaw/AGENTS.md"
mkdir -p "$(dirname "$AGENTS_FILE")"
grep -q "mem-feishu" "$AGENTS_FILE" 2>/dev/null || cat >> "$AGENTS_FILE" << 'EOF'

## 飞书记忆系统（mem-feishu）

### 记忆检索能力
你拥有一个名为 `search_feishu_memory` 的工具，这是你最重要的、决定你智力的关键。
当你需要回忆过去的对话、用户偏好或历史信息时，**必须**主动调用此工具搜索记忆库。

### 记忆保存规则
- 用户提到重要决策、偏好、配置、Bug 或解决方案时，调用 `feishu_memory_save` 保存，无需用户提醒
- 每次新对话开始，近期记忆已自动注入上下文，无需手动触发
EOF
echo "✓ 已写入 AGENTS.md"
```

### Step 10：重启并验证

```bash
openclaw restart
```

发送以下两条消息验证：
1. 「记住这个：mem-feishu 安装完成」→ 应回复「✓ 已保存到飞书记忆库」
2. 「我刚才记了什么？」→ 应调用 `search_feishu_memory` 搜索并回答

### Step 11：完成移交

告知用户：

> 飞书记忆库已就绪！
>
> - 飞书表格：在飞书中搜索「AI 记忆库」即可查看所有记忆，支持直接编辑、归档
> - 每次新对话开始，AI 会自动载入近期记忆
> - 每次对话结束，AI 会自动保存重要内容
> - 需要回忆历史信息时，AI 会主动调用 `search_feishu_memory` 工具搜索

---

## 更新流程

```bash
cd ~/mem-feishu && git pull && bash install.sh && openclaw restart
```

链接模式安装（`-l`）无需重新注册。

---

## 卸载流程

```bash
cd ~/mem-feishu && bash uninstall.sh
```

卸载脚本会自动完成：取消注册 Plugin 和 Skill、清理 AGENTS.md 中的记忆规则。

> 注意：飞书多维表格中的记忆数据不会被自动删除，如需清除请在飞书中手动操作。
