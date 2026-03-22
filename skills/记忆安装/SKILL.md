# 记忆安装

## 描述

引导用户完成 mem-feishu 的完整安装，包括创建飞书应用、初始化记忆库、配置 OpenClaw 插件。

## 触发时机

用户说「安装飞书记忆」、「配置记忆插件」、「设置 mem-feishu」时触发。

---

## 安装流程

### 第一步：确认代码已下载

检查 mem-feishu 目录是否存在：

```bash
ls mem-feishu/dist/index.js 2>/dev/null && echo "已安装" || echo "需要下载"
```

若未安装，执行：

```bash
# 国内用户（推荐）
git clone https://gitee.com/billzhuang6569/mem-feishu
# GitHub 用户：git clone https://github.com/billzhuang6569/mem-feishu

cd mem-feishu && npm install && npm run build
```

### 第二步：引导用户创建飞书应用

告诉用户：

> 需要先在飞书开放平台创建一个应用。步骤如下：
> 1. 打开 https://open.feishu.cn/app
> 2. 点击「创建企业自建应用」，命名为「AI 记忆助手」
> 3. 进入「凭证与基础信息」，复制 **App ID** 和 **App Secret**
> 4. 进入「权限管理」页面，开启：`bitable:app`（多维表格）
> 5. 发布版本后，权限生效

请用户告知 App ID 和 App Secret。

### 第三步：运行 setup（自动创建飞书多维表格）

用用户提供的凭证运行 setup：

```bash
FEISHU_APP_ID=<用户的AppID> FEISHU_APP_SECRET=<用户的AppSecret> \
  node mem-feishu/dist/index.js setup
```

**如果用户没有提前创建多维表格**（大多数情况）：setup 会自动创建「AI 记忆库」并输出 App Token 和表格链接。将输出中的 `FEISHU_APP_TOKEN=xxx` 记录下来。

**如果用户已有多维表格**：从飞书表格 URL 中复制 App Token（格式 `Basz...`），然后加上 `FEISHU_APP_TOKEN=xxx` 重新运行 setup。

### 第四步：注册 OpenClaw 插件

```bash
openclaw plugins install mem-feishu/openclaw-plugin
```

### 第五步：写入 OpenClaw 配置

将以下内容添加到 OpenClaw 配置文件（通常是 `~/.openclaw/openclaw.json5`）：

```json5
{
  plugins: {
    entries: {
      "mem-feishu": {
        enabled: true,
        env: {
          FEISHU_APP_ID: "<步骤二获取的 App ID>",
          FEISHU_APP_SECRET: "<步骤二获取的 App Secret>",
          FEISHU_APP_TOKEN: "<步骤三输出的 App Token>"
        }
      }
    },
    slots: {
      memory: "mem-feishu"
    }
  }
}
```

### 第六步：重启 OpenClaw

告知用户重启 OpenClaw 后生效。

### 第七步：验证

引导用户发送：「记住这个：安装完成」

然后问：「我刚才记了什么？」

两步都成功说明安装正常。最后告诉用户：

> 你的飞书记忆库已就绪！可以直接在飞书中打开「AI 记忆库」多维表格查看所有记忆。
> 如果忘记了表格链接，随时可以问我「我的飞书记忆表格在哪里」。
