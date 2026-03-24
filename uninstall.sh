#!/bin/bash
# mem-feishu 卸载脚本

echo "=== 卸载 mem-feishu ==="

# 卸载 OpenClaw Plugin
echo "卸载 Plugin..."
openclaw plugins uninstall mem-feishu 2>/dev/null && echo "✓ Plugin 已卸载" || echo "（Plugin 未注册或已卸载）"

# Skills 随插件自动加载，插件卸载后 Skills 也会自动失效，无需单独卸载。

echo ""
echo "✓ 卸载完成。如需删除代码和数据："
echo "  rm -rf $(pwd)"
echo ""
echo "注意：飞书多维表格中的记忆数据不会被自动删除，如需清理请在飞书中手动操作。"
