---
name: mem-feishu-setup
description: 安装和更新 mem-feishu 飞书记忆插件，将 AI 记忆自动存入飞书多维表格
version: 1.0.0
homepage: https://github.com/billzhuang6569/mem-feishu
---

# mem-feishu 安装向导 🧠

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
- **INSTALLED** → 直接跳到「更新流程」
- 用户说「卸载」→ 跳到「卸载流程」

---

## 安装流程

开始前，先向用户说明需要准备哪些东西，并展示进度清单：

> 🧠 **mem-feishu 安装向导**
>
> 我来帮你一步步完成安装！在开始之前，我们需要准备 3 样东西：
>
> - 🟡 **飞书 App ID + App Secret**（用于连接飞书多维表格）
> - 🟡 **Google API Key**（用于 AI 语义搜索）
> - 🟡 **飞书邮箱或 Open ID**（用于把多维表格的所有权转交给你）
>
> 准备好了吗？让我们开始！👇

---

### Step 1：克隆代码

```bash
cd ~ && git clone https://github.com/billzhuang6569/mem-feishu && cd mem-feishu
bash install.sh
```

> ✅ `install.sh` 会自动检测网络选择 npm 源，完成后显示「✓ 安装完成」。

---

### Step 2：获取飞书 App ID 和 App Secret

向用户展示引导说明：

> 🔑 **第一步：创建飞书应用**
>
> 我们需要在飞书开放平台创建一个专属应用，这样 AI 才能读写你的记忆表格。
>
> 请按以下步骤操作（大约需要 3 分钟）：
>
> 1. 打开 👉 https://open.feishu.cn/app
> 2. 点击右上角「**创建企业自建应用**」
> 3. 应用名称填写：**AI 记忆助手**，随便填一个描述，保存
> 4. 进入「**凭证与基础信息**」页面，复制你的：
>    - `App ID`（格式类似 `cli_xxxxxxxxxx`）
>    - `App Secret`（点击「查看」后复制）
> 5. 进入「**权限管理**」，搜索 `bitable`，开启 `bitable:app`（多维表格读写）
> 6. 点击左侧「**版本管理与发布**」，发布一个版本使权限生效
>
> 完成后，把 **App ID** 和 **App Secret** 发给我 👆

等用户提供 App ID 和 App Secret，收到后：

> ✅ 收到！App ID 和 App Secret 已记录。

**记录变量**：`FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`。

---

### Step 3：获取 Google API Key

向用户展示引导说明：

> 🔑 **第二步：获取 Google API Key**
>
> mem-feishu 使用 Google 的 AI 模型来理解你说话的意思，从而精准搜索历史记忆。
>
> 获取方式非常简单（1 分钟）：
>
> 1. 打开 👉 https://aistudio.google.com/apikey
> 2. 用你的 Google 账号登录
> 3. 点击「**Create API Key**」
> 4. 选择任意 Google 项目（或新建一个），点击确认
> 5. 复制生成的 API Key（格式：`AIza...`）
>
> ⚠️ 这个 Key 有免费额度，日常记忆使用完全够用，不需要付费。
>
> 把 **API Key** 发给我 👆

等用户提供 Google API Key，收到后：

> ✅ 收到！Google API Key 已记录。

---

### Step 4：初始化飞书记忆库

```bash
cd ~/mem-feishu
FEISHU_APP_ID=<AppID> FEISHU_APP_SECRET=<AppSecret> node dist/index.js setup
```

setup 命令会自动创建「AI 记忆库」多维表格。复制输出中的 `FEISHU_APP_TOKEN=Basz...`。

> ✅ 飞书多维表格已创建！

---

### Step 5：移交多维表格所有权

向用户展示引导：

> 🔑 **第三步：多维表格所有权移交**
>
> 刚才创建的表格是用「AI 记忆助手」这个应用的名义创建的，你在飞书里可能看不到。
> 移交之后，表格就会出现在你自己的飞书空间里，可以直接查看和编辑所有记忆。
>
> 请提供你的飞书账号信息（二选一即可）：
>
> - 📧 **飞书邮箱**（格式：`yourname@company.com`）
> - 🆔 **飞书 Open ID**（格式：`ou_xxxxxxxxx`，在飞书个人资料页可查看）
>
> 把其中一个发给我 👆

等用户提供邮箱或 Open ID，收到后执行移交：

```bash
# 使用邮箱
FEISHU_APP_ID=<AppID> FEISHU_APP_SECRET=<AppSecret> FEISHU_APP_TOKEN=<Token> \
  node dist/index.js transfer-owner --email <飞书邮箱>

# 或使用 Open ID
FEISHU_APP_ID=<AppID> FEISHU_APP_SECRET=<AppSecret> FEISHU_APP_TOKEN=<Token> \
  node dist/index.js transfer-owner --openid <ou_xxx>
```

移交成功后，**将用户信息保存到 `~/.openclaw/user.md`**：

```bash
USER_FILE="$HOME/.openclaw/user.md"
mkdir -p "$(dirname "$USER_FILE")"
cat > "$USER_FILE" << EOF
# 用户信息

- **飞书邮箱**：<用户邮箱或「未提供」>
- **飞书 Open ID**：<用户 Open ID 或「未提供」>
- **记忆库设置时间**：$(date '+%Y-%m-%d %H:%M')
EOF
echo "✓ 用户信息已保存到 ~/.openclaw/user.md"
```

> ✅ 多维表格所有权已移交！你现在可以在飞书中搜索「AI 记忆库」找到它。
> ✅ 你的飞书信息已保存，下次安装或更新无需重复填写。

---

### Step 6：注册 OpenClaw 插件

```bash
openclaw plugins install -l ~/mem-feishu/openclaw-plugin
```

> ✅ 插件注册完成！

---

### Step 7：写入 OpenClaw 配置

编辑 `~/.openclaw/openclaw.json5`，在 plugins 部分添加（保留已有其他内容）：

```json5
{
  plugins: {
    entries: {
      "mem-feishu": {
        enabled: true,
        config: {
          FEISHU_APP_ID: "<Step 2 的 App ID>",
          FEISHU_APP_SECRET: "<Step 2 的 App Secret>",
          FEISHU_APP_TOKEN: "<Step 4 输出的 App Token>",
          GOOGLE_API_KEY: "<Step 3 的 Google API Key>"
        }
      }
    },
    slots: {
      memory: "mem-feishu"
    }
  }
}
```

> ✅ 配置写入完成！

---

### Step 8：写入 AGENTS.md（让 AI 知道如何使用记忆）

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

---

### Step 9：重启并验证

```bash
openclaw restart
```

重启后，向用户说明验证方法：

> 🎉 **安装完成！让我们验证一下**
>
> 请发送这条消息：**「记住这个：mem-feishu 安装完成」**
>
> 如果 AI 回复「✓ 已保存到飞书记忆库」，说明一切正常！

验证成功后，发送完成移交消息：

> 🧠 **mem-feishu 已就绪！**
>
> ✅ **飞书多维表格**：在飞书搜索「AI 记忆库」即可查看所有记忆，支持直接编辑和归档
> ✅ **自动保存**：每次对话结束，AI 会自动将重要内容存入记忆库
> ✅ **自动载入**：每次新开对话，AI 会自动加载近期记忆
> ✅ **主动搜索**：当你需要回忆历史时，AI 会主动调用记忆搜索工具
>
> 你只需要正常和我对话，记忆功能完全在后台自动工作 ✨

---

## 更新流程

```bash
cd ~/mem-feishu && git pull && bash install.sh && openclaw restart
```

> ✅ 链接模式安装（`-l`）无需重新注册，重启即可生效。

---

## 卸载流程

```bash
cd ~/mem-feishu && bash uninstall.sh
```

> ⚠️ 卸载后飞书多维表格中的记忆数据不会被删除，如需清除请在飞书中手动操作。
