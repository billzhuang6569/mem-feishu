# mem-feishu-v2 安装向导

> **致 OpenClaw Agent**：请严格按照以下步骤，帮助用户在本地环境中安装并配置 `mem-feishu-v2` 插件。在执行每一步之前，请先向用户解释你将要做什么。

## 第一步：克隆仓库并编译

请使用你的 `computer` 工具（或终端执行能力），在用户的 `~/.openclaw/extensions/` 目录下执行以下命令：

```bash
cd ~/.openclaw/extensions/
git clone https://github.com/billzhuang6569/mem-feishu.git -b v2 mem-feishu-v2
cd mem-feishu-v2
npm install
npm run build
```

*如果目录已存在，请先删除或提示用户。*

## 第二步：安装插件

编译完成后，请执行以下命令将插件链接到 OpenClaw：

```bash
openclaw plugins install -l ~/.openclaw/extensions/mem-feishu-v2
```

安装后请显式启用插件并切换 memory slot：

```bash
openclaw plugins enable mem-feishu-v2
openclaw config set plugins.slots.memory mem-feishu-v2
```

然后执行诊断，确认 memory slot 和插件状态一致：

```bash
openclaw plugins inspect mem-feishu-v2
openclaw plugins doctor
```

注意：不要使用 `agents.defaults.memorySearch.plugin` 来切换记忆插件。`mem-feishu-v2` 属于 memory 插件槽位，正确开关是 `plugins.slots.memory`。

执行完毕后，请重启 OpenClaw Gateway：

```bash
openclaw gateway restart
```

## 第三步：引导用户配置

插件安装成功后，请向用户发送以下信息，引导他们完成配置：

"🎉 **mem-feishu-v2 插件安装成功！**

为了让你的记忆库运转起来，我们需要进行简单的配置。请告诉我：

1. **你是否已经有飞书自建应用？**
   - 如果有，请提供 `App ID` 和 `App Secret`。
   - 如果没有，请访问 [飞书开发者后台](https://open.feishu.cn/app/) 创建一个，并赋予 `bitable` 和 `drive` 相关权限。

2. **你的飞书注册邮箱是什么？**（用于将你添加为记忆库的管理员）

3. **（可选）你是否需要开启 VikingDB 向量搜索？**
   - 如果需要，请提供 `AK`、`SK` 和 `Index Name`。

收到你的信息后，我会自动为你创建多维表格并完成所有配置！"

## 第四步：调用 Setup 工具

当用户提供了上述信息后，请调用本插件提供的 `mem_feishu_setup` 工具，将用户提供的信息作为参数传入，完成最终的建表和配置工作。
