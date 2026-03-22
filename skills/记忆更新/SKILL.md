# 记忆更新

## 描述

将已安装的 mem-feishu 更新到最新版本，包括拉取代码、重新构建、重新注册插件。

## 触发时机

用户说「更新飞书记忆插件」、「升级 mem-feishu」、「mem-feishu 有新版本」时触发。

---

## 更新流程

### 第一步：确认安装目录

```bash
ls mem-feishu/package.json 2>/dev/null && echo "找到安装目录" || echo "找不到目录"
```

如果找不到，询问用户 mem-feishu 安装在哪个路径，然后 `cd` 到该目录。

### 第二步：拉取最新代码

```bash
cd mem-feishu
git pull
```

如果用户是国内网络，建议从 Gitee 拉取更快：

```bash
git remote set-url origin https://gitee.com/billzhuang6569/mem-feishu
git pull
```

### 第三步：重新安装依赖并构建

```bash
npm install && npm run build
```

### 第四步：重新注册插件

**方式 A（链接模式，推荐）**：如果当初用 `--link` 安装，无需重新注册，重启 OpenClaw 即可：

```bash
openclaw restart
```

**方式 B（复制模式）**：如果当初未用 `--link`，需要卸载后重新安装：

```bash
openclaw plugins uninstall mem-feishu
openclaw plugins install mem-feishu/openclaw-plugin
```

然后重启 OpenClaw。

### 第五步：验证版本

让用户问：「mem-feishu 的版本是多少？」

AI 会调用 `feishu_memory_info` 返回版本号，确认已更新。

---

## 提示：如何避免每次手动更新

建议初次安装时使用链接模式：

```bash
openclaw plugins install -l /绝对路径/mem-feishu/openclaw-plugin
```

这样以后 `git pull && npm run build` 之后重启 OpenClaw 即可，无需重新注册。
