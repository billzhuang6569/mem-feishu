/**
 * mem-feishu OpenClaw Plugin（适配层）
 *
 * 将 mem-feishu core 的记忆能力接入 OpenClaw。
 * Core 层（../src/）完全独立，本文件是薄的适配层。
 *
 * 使用的 OpenClaw Plugin SDK API：
 *   - api.registerContextEngine() — 自动注入记忆到上下文 + 自动保存
 *   - api.registerTool()          — LLM 可调用的工具（save / search / recent / info）
 *
 * import from: openclaw/plugin-sdk/plugin-entry
 */

import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { Type } from '@sinclair/typebox';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '../dist/index.js');

function runCli(args: string[], timeoutMs = 15000): string {
  try {
    return execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      timeout: timeoutMs,
      env: process.env,
    });
  } catch {
    return '';
  }
}

function getProjectName(): string {
  return path.basename(process.cwd());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function register(api: any) {
  // ── Context Engine：记忆注入 + 自动捕获 ────────────────────────────────
  // kind: "memory" 在 manifest 中声明，通过 plugins.slots.memory 选中本插件
  api.registerContextEngine?.('mem-feishu', () => ({
    info: {
      id: 'mem-feishu',
      name: '飞书记忆层',
      ownsCompaction: false,
    },

    // ingest：会话结束时，自动捕获最后一条 assistant 消息
    async ingest({ messages }: { messages: Array<{ role: string; content: string }> }) {
      const last = [...messages].reverse().find((m) => m.role === 'assistant');
      if (last?.content && last.content.length >= 50) {
        const content = last.content.slice(0, 1000);
        const project = getProjectName();
        setImmediate(() => {
          runCli([
            'save',
            '--content', content,
            '--tags', `自动捕获,${project}`,
            '--source', 'openclaw',
            '--project', project,
          ], 30000);
        });
      }
      return { ingested: true };
    },

    // assemble：每次构建 prompt 前，搜索相关记忆
    // 通过 systemPromptAddition 注入（官方机制），不往 messages 里插 system 消息
    // messages 中手动插入 system role 会被 sanitize pipeline 过滤掉
    async assemble({
      messages,
    }: {
      messages: Array<{ role: string; content: string }>;
      tokenBudget?: number;
    }) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      const query = (lastUser?.content ?? '').slice(0, 150);

      let memBlock = '';
      if (query.length > 5) {
        memBlock = runCli(['search', '--query', query, '--limit', '10', '--format']);
      }
      if (!memBlock) {
        memBlock = runCli(['recent', '--limit', '5', '--format']);
      }

      return {
        messages,
        estimatedTokens: 0,
        // systemPromptAddition 由 OpenClaw 自动 prepend 到 system prompt 头部
        systemPromptAddition: memBlock.trim() || undefined,
      };
    },

    // compact：委托给 runtime 的默认压缩算法
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async compact(params: any) {
      try {
        const { delegateCompactionToRuntime } = await import('openclaw/plugin-sdk/core');
        return await delegateCompactionToRuntime(params);
      } catch {
        return { ok: true, compacted: false };
      }
    },
  }));

  // ── Tool 1：记忆保存 ─────────────────────────────────────────────────────
  api.registerTool({
    name: 'feishu_memory_save',
    description: '将重要信息保存到飞书记忆库（多维表格）。当用户要求记住某件事时调用。',
    parameters: Type.Object({
      content: Type.String({ description: '要保存的记忆内容（精炼后的核心信息）' }),
      tags: Type.Optional(Type.Array(Type.String(), { description: '分类标签，如：决策、配置、调试、团队、偏好' })),
    }),
    async execute(_id: string, params: { content: string; tags?: string[] }) {
      const tags = params.tags ?? [];
      const project = getProjectName();
      const out = runCli([
        'save',
        '--content', params.content,
        '--tags', [...tags, project].join(','),
        '--source', 'openclaw',
        '--project', project,
      ]);
      let ok = false;
      try { ok = JSON.parse(out).ok; } catch { /* ignore */ }
      return {
        content: [{ type: 'text', text: ok ? '✓ 已保存到飞书记忆库' : `保存失败：${out}` }],
      };
    },
  });

  // ── Tool 2：记忆查询 ─────────────────────────────────────────────────────
  api.registerTool({
    name: 'feishu_memory_search',
    description: '从飞书记忆库向量搜索历史记忆。当用户询问历史信息或需要上下文时调用。',
    parameters: Type.Object({
      query: Type.String({ description: '搜索关键词或描述' }),
      limit: Type.Optional(Type.Number({ description: '返回条数（默认 10）' })),
    }),
    async execute(_id: string, params: { query: string; limit?: number }) {
      const out = runCli(['search', '--query', params.query, '--limit', String(params.limit ?? 10), '--format']);
      return {
        content: [{ type: 'text', text: out || '未找到相关记忆' }],
      };
    },
  });

  // ── Tool 3：最近记忆 ─────────────────────────────────────────────────────
  api.registerTool(
    {
      name: 'feishu_memory_recent',
      description: '获取最近保存的记忆列表。用于概览历史记录。',
      parameters: Type.Object({
        limit: Type.Optional(Type.Number({ description: '返回条数（默认 20）' })),
      }),
      async execute(_id: string, params: { limit?: number }) {
        const out = runCli(['recent', '--limit', String(params.limit ?? 20), '--format']);
        return {
          content: [{ type: 'text', text: out || '暂无记忆记录' }],
        };
      },
    },
    { optional: true },
  );

  // ── Tool 4：记忆库信息（飞书表格链接）────────────────────────────────────
  // 用户问「我的飞书记忆表格在哪里」时调用
  api.registerTool(
    {
      name: 'feishu_memory_info',
      description: '获取飞书记忆库的直接链接和状态信息。当用户询问记忆表格在哪里时调用。',
      parameters: Type.Object({}),
      async execute(_id: string, _params: Record<string, never>) {
        const out = runCli(['info']);
        return {
          content: [{ type: 'text', text: out || '无法获取记忆库信息，请检查环境变量配置' }],
        };
      },
    },
    { optional: true },
  );
}
