#!/bin/bash
# OpenClaw 集成测试（需要服务器 SSH 信息）
# 使用方式：SSH_HOST=user@vps bash test/openclaw-integration.sh

# TODO: 等用户提供服务器 SSH 地址和密钥后完善
echo "OpenClaw 集成测试：请先提供服务器 SSH 信息"
echo "需要的信息："
echo "  1. SSH 地址（user@host）"
echo "  2. SSH 端口（默认 22）"
echo "  3. OpenClaw 监听端口（通常 18789）"
echo ""
echo "完整测试命令将在获取上述信息后生成。"
