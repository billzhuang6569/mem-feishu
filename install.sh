#!/bin/bash
set -e
echo "检测网络环境..."
if curl -s --max-time 3 https://registry.npmjs.org > /dev/null 2>&1; then
  echo "使用 npm 官方源安装..."
  npm install
  cd openclaw-plugin && npm install && cd ..
else
  echo "官方源不可达，切换到 npmmirror 镜像..."
  npm install --registry https://registry.npmmirror.com
  cd openclaw-plugin && npm install --registry https://registry.npmmirror.com && cd ..
fi
npm run build
echo "✓ 安装完成"
