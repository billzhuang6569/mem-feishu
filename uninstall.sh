#!/bin/bash
# mem-feishu 卸载脚本

echo "=== 卸载 mem-feishu ==="

# 卸载 OpenClaw Plugin
echo "卸载 Plugin..."
openclaw plugins uninstall mem-feishu 2>/dev/null && echo "✓ Plugin 已卸载" || echo "（Plugin 未注册或已卸载）"

# 卸载 OpenClaw Skill
echo "卸载 Skill..."
openclaw skills uninstall mem-feishu-setup 2>/dev/null && echo "✓ Skill 已卸载" || echo "（Skill 未注册或已卸载）"

# 清理 AGENTS.md 中注入的记忆规则
AGENTS_FILE="$HOME/.openclaw/AGENTS.md"
if [ -f "$AGENTS_FILE" ] && grep -q "mem-feishu" "$AGENTS_FILE" 2>/dev/null; then
  # 删除 mem-feishu 相关段落
  sed -i.bak '/## 飞书记忆系统（mem-feishu）/,/^## /{ /^## 飞书记忆系统（mem-feishu）/d; /^## /!d }' "$AGENTS_FILE" 2>/dev/null || true
  echo "✓ 已清理 AGENTS.md 中的记忆规则"
fi

echo ""
echo "✓ 卸载完成。如需删除代码和数据："
echo "  rm -rf $(pwd)"
echo ""
echo "注意：飞书多维表格中的记忆数据不会被自动删除，如需清理请在飞书中手动操作。"
