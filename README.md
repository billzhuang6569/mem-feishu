# mem-feishu

**让你的 AI 助手真正记住你。**

mem-feishu 是一个为 [OpenClaw](https://openclaw.ai) 设计的记忆插件。它将 AI 的记忆存储在你自己的**飞书多维表格**中——你可以随时打开飞书，像操作表格一样查看、编辑、搜索所有 AI 记忆。

> 📦 仓库地址（国内推荐）：https://gitee.com/billzhuang6569/mem-feishu
> 📦 GitHub 镜像：https://github.com/billzhuang6569/mem-feishu

- **自动**：每次对话结束后，重要内容自动存入飞书
- **智能**：下次对话时，相关记忆自动注入上下文，AI 知道你的历史
- **可视**：所有记忆都在飞书多维表格里，清晰可见，随手可编辑
- **私有**：数据只在你的飞书账号里，没有第三方云端

---

## 快速开始

### 方式一：直接告诉 OpenClaw（推荐，无需懂技术）

在 OpenClaw 对话框里发送这条消息：

```
帮我安装飞书记忆插件：
git clone https://gitee.com/billzhuang6569/mem-feishu && cd mem-feishu && npm install
然后按照 skills/记忆安装/SKILL.md 里的步骤引导我完成设置。
```

OpenClaw 会帮你运行命令并一步步引导完成配置。

---

### 方式二：命令行安装（5 步完成）

**第 1 步：克隆并安装依赖**

```bash
# 国内用户（推荐）
git clone https://gitee.com/billzhuang6569/mem-feishu
# GitHub 用户
# git clone https://github.com/billzhuang6569/mem-feishu

cd mem-feishu
npm install
npm run build
```

**第 2 步：创建飞书应用**

1. 打开 [飞书开放平台](https://open.feishu.cn/app) → 创建企业自建应用
2. 进入「凭证与基础信息」，复制 **App ID** 和 **App Secret**
3. 进入「权限管理」，开启权限：
   - `bitable:app`（多维表格读写 + 自动创建）

**第 3 步：初始化飞书记忆库**

```bash
FEISHU_APP_ID=你的AppID FEISHU_APP_SECRET=你的AppSecret node dist/index.js setup
```

如果你**没有**提前创建多维表格，`setup` 会**自动帮你创建**一个「AI 记忆库」，并输出表格链接和 App Token：

```
✓ 飞书多维表格 Base 创建成功！

  App Token：BaszyourTokenHere
  直接链接：https://feishu.cn/base/BaszyourTokenHere

  ⚠️  请将以下环境变量添加到你的 OpenClaw 配置中：
  FEISHU_APP_TOKEN=BaszyourTokenHere
```

> 如果你已经有多维表格，直接在 URL 里复制 App Token（格式为 `Basz...`），然后加上 `FEISHU_APP_TOKEN=xxx` 运行 setup 即可。

**第 4 步：将插件注册到 OpenClaw**

```bash
openclaw plugins install ./openclaw-plugin
```

**第 5 步：在 OpenClaw 配置文件中添加环境变量**

编辑 `~/.openclaw/openclaw.json5`（或你的配置文件），添加：

```json5
{
  plugins: {
    entries: {
      "mem-feishu": {
        enabled: true,
        env: {
          FEISHU_APP_ID: "你的 App ID",
          FEISHU_APP_SECRET: "你的 App Secret",
          FEISHU_APP_TOKEN: "自动创建时输出的 Token"
        }
      }
    },
    slots: {
      memory: "mem-feishu"   // 将 mem-feishu 设为活跃记忆引擎
    }
  }
}
```

重启 OpenClaw，完成。

---

## 它怎么工作

### 自动记忆（无需你做任何事）

| 时机 | 行为 |
|------|------|
| 每次对话开始前 | 自动搜索与本次话题相关的历史记忆，注入 AI 上下文 |
| 每次对话结束后 | 自动将 AI 的回复摘要保存到飞书表格 |

### 主动记忆（你告诉 AI 要记什么）

| 你说 | AI 做什么 |
|------|----------|
| 「记住这个：我偏好用 TypeScript」 | 调用 `feishu_memory_save`，存入飞书 |
| 「帮我找找之前关于架构的讨论」 | 调用 `feishu_memory_search`，向量搜索历史 |
| 「我的飞书记忆表格在哪里」 | 调用 `feishu_memory_info`，返回表格直链 |

### 在飞书里管理记忆

直接打开飞书，「AI 记忆库」多维表格里有所有记录。你可以：
- **筛选**：按标签、来源、状态过滤
- **编辑**：修改内容或补充说明
- **归档**：将状态改为「归档」，不再注入上下文

---

## 飞书表格字段

| 字段 | 说明 |
|------|------|
| **记忆ID**（第一字段）| 唯一标识，向量库关联 key |
| 内容 | 记忆正文 |
| 标签 | 分类（自动捕获、决策、配置、调试、团队…） |
| 来源 | openclaw / 手动 |
| 状态 | 活跃 / 暂停 / 归档 / 已删除 |
| 项目 | 对话时的工作目录名 |
| 创建时间 | 记录写入时间 |

---

## 环境变量参考

| 变量 | 是否必填 | 说明 |
|------|---------|------|
| `FEISHU_APP_ID` | ✅ 必填 | 飞书应用的 App ID |
| `FEISHU_APP_SECRET` | ✅ 必填 | 飞书应用的 App Secret |
| `FEISHU_APP_TOKEN` | ❌ 可选 | 多维表格 Base App Token（`setup` 可自动创建并缓存）|
| `FEISHU_TABLE_NAME` | ❌ 可选 | 表格名称，默认 `AI 记忆库` |

---

## CLI 命令（高级用户）

```bash
# 初始化（自动创建表格）
node dist/index.js setup

# 保存记忆
node dist/index.js save --content "内容" --tags "决策,配置"

# 向量搜索
node dist/index.js search --query "关键词" --limit 10

# 最近记忆
node dist/index.js recent --limit 20

# 查看表格链接
node dist/index.js info
```

---

## 技术架构

```
OpenClaw（对话界面）
    ↓  registerContextEngine + registerTool
openclaw-plugin/（适配层，~150 行）
    ↓  CLI 调用
src/（Core 层，独立，不依赖任何 AI 框架）
    ↙                    ↘
飞书 Bitable API        本地 SQLite + sqlite-vec
（正文 + 元数据 + 可视化）  （向量索引，语义搜索）
```

Core 层完全解耦，未来可接入 Claude Code、Cursor 等其他平台。

---

## License

MIT
