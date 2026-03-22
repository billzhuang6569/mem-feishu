import type { Memory } from '../feishu/types.js';

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days} 天前`;
  if (hours > 0) return `${hours} 小时前`;
  if (minutes > 0) return `${minutes} 分钟前`;
  return '刚刚';
}

function truncate(text: string, max = 500): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

// 将记忆列表格式化为注入 agent 上下文的文本块
export function formatMemories(memories: Memory[]): string {
  if (memories.length === 0) return '';

  const lines = memories.map((m, i) => {
    const tags = m.tags.length > 0 ? `[${m.tags.join(', ')}]` : '';
    const age = relativeTime(m.createdAt);
    const project = m.project ? ` | ${m.project}` : '';
    return `${i + 1}. ${tags} (${m.source}${project}, ${age})\n   ${truncate(m.content)}`;
  });

  return `--- 历史记忆 (${memories.length} 条) ---\n${lines.join('\n\n')}\n---`;
}
