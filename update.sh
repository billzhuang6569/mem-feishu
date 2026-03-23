#!/bin/bash
set -e
echo "=== 开始更新 mem-feishu ==="
cd "$(dirname "$0")"

# 1. 拉取最新代码
echo "拉取最新代码..."
git pull origin main

# 2. 重新安装依赖并构建
echo "重新构建..."
bash install.sh

# 3. 重新注册 Plugin 和 Skills（确保 OpenClaw 载入最新配置和指令）
echo "更新 OpenClaw 插件和 Skills..."
openclaw plugins install -l ~/mem-feishu/openclaw-plugin
openclaw skills install ~/mem-feishu/skills/记忆安装
openclaw skills install ~/mem-feishu/skills/记忆管理

# 4. 预留：数据迁移（如向量维度变化，自动重建本地向量库）
# node dist/index.js sync || true

echo ""
echo "✓ 更新完成！请重启 OpenClaw 以应用更改。"
