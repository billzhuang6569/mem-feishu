# mem-feishu

**让你的 AI 助手真正记住你。**

mem-feishu 是一个为 [OpenClaw](https://openclaw.ai) 设计的记忆插件，将 AI 的记忆存储在你自己的**飞书多维表格**中。

- **自动**：对话结束后，重要内容自动存入飞书
- **智能**：下次对话时，相关记忆自动注入上下文，AI 了解你的历史
- **可视**：所有记忆在飞书多维表格中清晰可见，随时可编辑、归档
- **私有**：数据只在你的飞书账号里，无第三方云端

---

## 安装

> **一句话安装**：直接把下面的消息发给 OpenClaw，它会全程帮你完成。

**国内用户（Gitee，推荐）：**

```
帮我安装飞书记忆插件：git clone https://gitee.com/billzhuang6569/mem-feishu && cd mem-feishu && npm install && npm run build，然后按照 skills/记忆安装/SKILL.md 引导我完成所有设置。
```

**国际用户（GitHub）：**

```
Help me install the mem-feishu plugin: git clone https://github.com/billzhuang6569/mem-feishu && cd mem-feishu && npm install && npm run build, then follow skills/记忆安装/SKILL.md to guide me through the full setup.
```

OpenClaw 会自动执行命令，引导你完成飞书应用创建、记忆库初始化、权限配置，并将记忆规则写入 AGENTS.md，**全程无需手动操作**。

---

## 手动安装（5 步）

如果你偏好手动控制，可以按以下步骤操作。

### 第 1 步：克隆并安装依赖

```bash
# 国内用户（推荐，Gitee 访问更稳定）
git clone https://gitee.com/billzhuang6569/mem-feishu

# 国际用户
# git clone https://github.com/billzhuang6569/mem-feishu

cd mem-feishu
npm install   # .npmrc 已内置 npmmirror 镜像，国内可直接使用
npm run build
```

> **网络问题排查**：如果 `npm install` 失败，尝试：
> ```bash
> npm install --registry https://registry.npmmirror.com --ignore-optional
> ```
> `sharp` 和 `onnxruntime-node` 是可选依赖，安装失败不影响功能。

### 第 2 步：创建飞书应用

1. 打开 [飞书开放平台](https://open.feishu.cn/app) → 创建企业自建应用
2. 进入「凭证与基础信息」，复制 **App ID** 和 **App Secret**
3. 进入「权限管理」，开启：`bitable:app`（多维表格）
4. 发布版本，使权限生效

### 第 3 步：初始化飞书记忆库

```bash
FEISHU_APP_ID=你的AppID FEISHU_APP_SECRET=你的AppSecret node dist/index.js setup
```

如果没有提前创建多维表格，`setup` 会自动创建「AI 记忆库」并输出 App Token：

```
✓ 飞书多维表格 Base 创建成功！

  App Token：BaszyourTokenHere
  直接链接：https://feishu.cn/base/BaszyourTokenHere

  ⚠️  请将以下环境变量添加到你的 OpenClaw 配置中：
  FEISHU_APP_TOKEN=BaszyourTokenHere
```

### 第 4 步：注册插件并写入配置

```bash
# 推荐使用链接模式，以后更新只需 git pull + 重启，无需重新注册
openclaw plugins install -l $(pwd)/openclaw-plugin
```

编辑 `~/.openclaw/openclaw.json5`，添加：

```json5
{
  plugins: {
    entries: {
      "mem-feishu": {
        enabled: true,
        config: {
          FEISHU_APP_ID: "你的 App ID",
          FEISHU_APP_SECRET: "你的 App Secret",
          FEISHU_APP_TOKEN: "setup 输出的 App Token",
          // 国内用户可加速模型首次下载（可选）：
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

### 第 5 步：写入 AGENTS.md 并重启

```bash
# 将记忆规则写入 OpenClaw 全局 AGENTS.md，使 AI 每次对话都主动使用记忆
AGENTS_FILE="$HOME/.openclaw/AGENTS.md"
mkdir -p "$(dirname "$AGENTS_FILE")"
grep -q "mem-feishu" "$AGENTS_FILE" 2>/dev/null || cat >> "$AGENTS_FILE" << 'EOF'

## 飞书记忆系统（mem-feishu）

你已连接飞书记忆库，以下规则始终生效：
- 用户提到重要决策、偏好、配置时，调用 feishu_memory_save 保存
- 用户询问历史或需要上下文时，调用 feishu_memory_search
- 每次对话开始，记忆已自动注入，无需手动触发
EOF

openclaw restart
```

完成后发送「记住这个：安装完成」验证。

---

## 它怎么工作

| 时机 | 行为 |
|------|------|
| 每次对话开始 | 自动向量搜索相关历史记忆，注入 AI 上下文 |
| 每次对话结束 | 自动将对话摘要保存到飞书表格 |
| 你说「记住...」 | 调用 `feishu_memory_save`，立即存入飞书 |
| 你问「之前...」 | 调用 `feishu_memory_search`，语义搜索历史 |

**在飞书里管理记忆**：打开「AI 记忆库」多维表格，可按标签筛选、直接编辑内容、将状态改为「归档」使其不再注入上下文。

---

## 更新

```bash
cd mem-feishu
git pull && npm run build
openclaw restart   # 链接模式下无需重新注册
```

---

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `FEISHU_APP_ID` | ✅ | 飞书应用 App ID |
| `FEISHU_APP_SECRET` | ✅ | 飞书应用 App Secret |
| `FEISHU_APP_TOKEN` | 可选 | 多维表格 App Token（`setup` 可自动创建）|
| `FEISHU_TABLE_NAME` | 可选 | 表格名称，默认 `AI 记忆库` |
| `HF_ENDPOINT` | 可选 | Hugging Face 镜像，国内推荐 `https://hf-mirror.com` |

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

## 仓库地址

- 国内（Gitee，推荐）：https://gitee.com/billzhuang6569/mem-feishu
- 国际（GitHub）：https://github.com/billzhuang6569/mem-feishu

## License

MIT
