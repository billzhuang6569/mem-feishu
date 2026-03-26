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

# 注意：插件和 Skills 已在 openclaw.plugin.json 中声明，OpenClaw 会自动加载最新版本。
# 无需手动执行 openclaw plugins/skills install。

# 预留：数据迁移（如向量维度变化，自动重建本地向量库）
# node dist/index.js sync || true

echo ""
echo "✓ 更新完成！请重启 OpenClaw 以应用更改。"
