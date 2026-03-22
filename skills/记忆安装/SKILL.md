# 记忆安装

## 描述

引导用户完成 mem-feishu 的安装和配置，包括创建飞书应用、获取 App Token、初始化多维表格，并将插件接入 OpenClaw。

## 触发时机

用户说「安装记忆」、「配置飞书记忆」、「设置 mem-feishu」时触发。

## 安装步骤

### 第一步：创建飞书应用

引导用户完成以下操作：

1. 打开飞书开放平台：https://open.feishu.cn/app
2. 点击「创建企业自建应用」
3. 填写应用名称（如「AI 记忆助手」）和描述
4. 创建后，进入「凭证与基础信息」页面
5. 复制 **App ID** 和 **App Secret**

### 第二步：配置应用权限

在应用的「权限管理」页面，开启以下权限：
- `bitable:app`（多维表格读写）

发布应用版本后申请权限审核（企业内部应用通常自动通过）。

### 第三步：创建飞书多维表格

1. 在飞书中创建一个新的多维表格
2. 打开表格，从 URL 中复制 **App Token**
   - URL 格式：`https://xxx.feishu.cn/base/<App Token>/...`
   - App Token 通常以 `Basz` 开头

### 第四步：初始化多维表格结构

```bash
FEISHU_APP_ID=<App ID> FEISHU_APP_SECRET=<App Secret> FEISHU_APP_TOKEN=<App Token> \
  node /path/to/mem-feishu/dist/index.js setup
```

成功后飞书中会出现「AI 记忆库」多维表格，记忆ID 为第一个字段。

### 第五步：在 OpenClaw 中配置插件

在 OpenClaw 配置文件（通常 `~/.openclaw/openclaw.json5` 或 `openclaw.config.json5`）中添加：

```json5
{
  plugins: {
    entries: {
      "mem-feishu": {
        enabled: true,
        env: {
          FEISHU_APP_ID: "<你的 App ID>",
          FEISHU_APP_SECRET: "<你的 App Secret>",
          FEISHU_APP_TOKEN: "<你的 App Token>"
        }
      }
    },
    // 将 mem-feishu 设为活跃记忆插件（独占 memory 插槽）
    slots: {
      memory: "mem-feishu"
    }
  }
}
```

### 第六步：安装插件包

```bash
openclaw plugins install /path/to/mem-feishu/openclaw-plugin
```

或者将插件路径加入 OpenClaw 的插件加载路径配置。

### 第七步：重启 OpenClaw

重启 OpenClaw 使插件和 context engine 生效。之后：
- 每次对话时，相关历史记忆会**自动注入**到上下文
- 每次对话结束后，助手回复会**自动保存**到飞书
- 可随时在飞书多维表格中查看、编辑、归档记忆
- 可对 LLM 说「记住这个」或「帮我查一下之前...的记录」

## 验证

安装完成后：
1. 说「记住这个：安装测试成功」→ 触发 `feishu_memory_save` 工具
2. 说「帮我查一下之前记的内容」→ 触发 `feishu_memory_search` 工具
3. 打开飞书多维表格，确认「AI 记忆库」中有新记录
