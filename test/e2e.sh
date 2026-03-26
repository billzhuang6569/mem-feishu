#!/bin/bash
# mem-feishu 1.0 端到端测试脚本
# 使用前需设置环境变量：FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_APP_TOKEN
set -e

PASS=0
FAIL=0
DIST="$(dirname "$0")/../dist/index.js"

check() {
  local desc="$1"
  local result="$2"
  local expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "PASS: $desc"
    ((PASS++))
  else
    echo "FAIL: $desc"
    echo "   输出：$result"
    ((FAIL++))
  fi
}

echo "=== mem-feishu 1.0 端到端测试 ==="
echo ""

# 检查环境变量
if [ -z "$FEISHU_APP_ID" ] || [ -z "$FEISHU_APP_SECRET" ] || [ -z "$FEISHU_APP_TOKEN" ]; then
  echo "缺少环境变量：FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_APP_TOKEN"
  exit 1
fi

# 检查构建产物
if [ ! -f "$DIST" ]; then
  echo "未找到 dist/index.js，请先运行 npm run build"
  exit 1
fi

# Test 1: save
echo "--- Test 1: 保存记忆 ---"
SAVE_OUT=$(node "$DIST" save --content "mem-feishu 1.0 e2e 测试记忆 $(date +%s)" --tags "测试,e2e" 2>/dev/null)
check "save 返回 ok:true" "$SAVE_OUT" '"ok":true'

# Test 2: recent（首次触发模型下载，耗时较长）
echo ""
echo "--- Test 2: 获取最近记忆（首次可能需要下载模型）---"
RECENT_OUT=$(node "$DIST" recent --limit 3 --format 2>/dev/null || true)
check "recent 返回非空内容" "$RECENT_OUT" "."

# Test 3: search
echo ""
echo "--- Test 3: 向量搜索 ---"
SEARCH_OUT=$(node "$DIST" search --query "e2e 测试" --limit 5 --format 2>/dev/null || true)
check "search 返回内容" "$SEARCH_OUT" "."

# 结果汇总
echo ""
echo "=== 测试结果：$PASS 通过，$FAIL 失败 ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
