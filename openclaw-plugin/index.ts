/**
 * mem-feishu OpenClaw Plugin（适配层）
 *
 * 将 mem-feishu core 的记忆能力接入 OpenClaw。
 * Core 层（../src/）完全独立，本文件是薄的适配层。
 *
 * 使用的 OpenClaw Plugin SDK API：
 *   - api.on('before_prompt_build') — 每次对话前注入相关记忆到上下文
 *   - api.on('agent_end')           — 每次对话后自动保存重要内容
 *   - api.registerTool()            — LLM 可调用的工具（save / search / recent / info）
 *
 * import from: openclaw/plugin-sdk/plugin-entry
 */

import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { Type } from '@sinclair/typebox';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '../dist/index.js');

// 从根目录 package.json 读取版本号
const _require = createRequire(import.meta.url);
const PKG_VERSION: string = (() => {
  try {
    return (_require(path.resolve(__dirname, '../package.json')) as { version: string }).version;
  } catch {
    return 'unknown';
  }
})();

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

export default definePluginEntry({
  id: 'mem-feishu',
  name: '飞书记忆层',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register(api: any) {
    console.log(`[mem-feishu] v${PKG_VERSION} 已加载`);

    // 将 plugins.entries.mem-feishu.config 中的配置注入 process.env
    // （core 层通过 process.env 读取飞书凭证）
    const cfg = api.config ?? {};
    if (cfg.FEISHU_APP_ID) process.env.FEISHU_APP_ID = cfg.FEISHU_APP_ID;
    if (cfg.FEISHU_APP_SECRET) process.env.FEISHU_APP_SECRET = cfg.FEISHU_APP_SECRET;
    if (cfg.FEISHU_APP_TOKEN) process.env.FEISHU_APP_TOKEN = cfg.FEISHU_APP_TOKEN;
    if (cfg.FEISHU_TABLE_NAME) process.env.FEISHU_TABLE_NAME = cfg.FEISHU_TABLE_NAME;
    if (cfg.HF_ENDPOINT) process.env.HF_ENDPOINT = cfg.HF_ENDPOINT;

    // ── Hook: 自动注入记忆（每次对话前）──────────────────────────────────
    api.on?.('before_prompt_build', (event: any) => {
      // 优先用当前用户消息做语义搜索
      const userMessage = event?.messages
        ? [...event.messages].reverse().find((m: { role: string; content: string }) => m.role === 'user')
        : null;
      const query = (userMessage?.content ?? '').slice(0, 150);

      let memBlock = '';
      if (query.length > 5) {
        memBlock = runCli(['search', '--query', query, '--limit', '10', '--format']);
      }
      if (!memBlock) {
        memBlock = runCli(['recent', '--limit', '5', '--format']);
      }

      return memBlock.trim() ? { appendSystemContext: memBlock.trim() } : {};
    });

    // ── Hook: 自动保存（每次对话后）──────────────────────────────────────
    api.on?.('agent_end', async (event: any) => {
      const messages: Array<{ role: string; content: string }> = event?.messages ?? [];
      const last = [...messages].reverse().find((m: { role: string; content: string }) => m.role === 'assistant');
      if (last?.content && last.content.length >= 100) {
        const content = last.content.slice(0, 500);
        const project = getProjectName();
        setImmediate(() => {
          runCli([
            'save',
            '--content', content,
            '--tags', `自动,${project}`,
            '--source', 'openclaw',
            '--project', project,
          ], 30000);
        });
      }
    });

    // ── Tool 1：记忆保存 ───────────────────────────────────────────────────
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

    // ── Tool 2：记忆查询 ───────────────────────────────────────────────────
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

    // ── Tool 3：最近记忆 ───────────────────────────────────────────────────
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

    // ── Tool 4：记忆库信息（飞书表格链接）──────────────────────────────────
    // 用户问「我的飞书记忆表格在哪里」时调用
    api.registerTool(
      {
        name: 'feishu_memory_info',
        description: '获取飞书记忆库的直接链接和状态信息。当用户询问记忆表格在哪里时调用。',
        parameters: Type.Object({}),
        async execute(_id: string, _params: Record<string, never>) {
          const out = runCli(['info']);
          const text = out
            ? `${out.trim()}\n\nmem-feishu 版本：v${PKG_VERSION}`
            : `mem-feishu 版本：v${PKG_VERSION}\n\n无法获取记忆库信息，请检查环境变量配置`;
          return {
            content: [{ type: 'text', text }],
          };
        },
      },
      { optional: true },
    );
  },
});
