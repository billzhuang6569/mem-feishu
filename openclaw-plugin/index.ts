/**
 * mem-feishu OpenClaw Plugin（适配层）
 *
 * 记忆生命周期（方案 B）：
 *   - command:new / session_start  → 注入最近 N 条记忆到新对话上下文
 *   - agent_end                   → 自动保存对话内容到飞书 + 本地向量库
 *   - search_feishu_memory Tool    → Agent 主动语义搜索历史记忆
 *   - feishu_memory_save Tool      → Agent 主动保存指定内容
 *   - feishu_memory_recent Tool    → 获取最近记忆列表
 *   - feishu_memory_info Tool      → 获取飞书表格链接
 */

import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Type } from '@sinclair/typebox';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '../dist/index.js');

const _require = createRequire(import.meta.url);
const PKG_VERSION: string = (() => {
  try {
    return (_require(path.resolve(__dirname, '../package.json')) as { version: string }).version;
  } catch {
    return 'unknown';
  }
})();

function runCli(args: string[], timeoutMs = 15000): string {
  return execFileSync('node', [CLI, ...args], {
    encoding: 'utf8',
    timeout: timeoutMs,
    env: process.env,
  });
}

function friendlyError(e: unknown, action: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('FEISHU_APP_ID') || msg.includes('FEISHU_APP_SECRET') || msg.includes('401') || msg.includes('AppID')) {
    return `${action}失败：飞书 App ID 或 App Secret 无效，请检查 openclaw.json5 中的配置。`;
  }
  if (msg.includes('FEISHU_APP_TOKEN') || msg.includes('app_token') || msg.includes('403')) {
    return `${action}失败：飞书多维表格 Token 无效或无权限，请重新运行 setup 命令。`;
  }
  if (msg.includes('GOOGLE_API_KEY') || msg.includes('API_KEY') || msg.includes('apiKey') || msg.includes('embedding')) {
    return `${action}失败：Google API Key 无效或未配置，请检查 openclaw.json5 中的 GOOGLE_API_KEY。`;
  }
  if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
    return `${action}失败：请求超时，请检查网络连接或代理设置。`;
  }
  return `${action}失败，请检查配置是否正确。（详情：${msg.slice(0, 100)}）`;
}

function getProjectName(): string {
  return path.basename(process.cwd());
}

// OpenClaw Plugin 注入模式：直接导出默认函数，不使用 SDK
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function(api: any) {
  console.log(`[mem-feishu] v${PKG_VERSION} 已加载`);
  console.log('[mem-feishu] api keys:', Object.keys(api));

  // 将 openclaw.json5 中 config 配置注入 process.env
  // 1. 先从环境变量收集已有值
  const cfg: Record<string, string | undefined> = {
    FEISHU_APP_ID:     process.env.FEISHU_APP_ID,
    FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET,
    FEISHU_APP_TOKEN:  process.env.FEISHU_APP_TOKEN,
    FEISHU_TABLE_NAME: process.env.FEISHU_TABLE_NAME,
    GOOGLE_API_KEY:    process.env.GOOGLE_API_KEY,
  };

  // 2. 环境变量缺失时，主动读取 ~/.openclaw/openclaw.json5
  if (!cfg.FEISHU_APP_ID || !cfg.GOOGLE_API_KEY) {
    try {
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json5');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const extract = (key: string): string | undefined => {
          const m = content.match(new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`));
          return m?.[1];
        };
        for (const key of Object.keys(cfg)) {
          cfg[key] = cfg[key] ?? extract(key);
        }
      }
    } catch (e) {
      console.error('[mem-feishu] 读取 openclaw.json5 失败:', e);
    }
  }

  // 3. 注入到 process.env，供 runCli 使用
  for (const [key, val] of Object.entries(cfg)) {
    if (val) process.env[key] = val;
  }

  console.log(`[mem-feishu] 环境变量检查:`);
  console.log(`  FEISHU_APP_ID: ${process.env.FEISHU_APP_ID ? '✅' : '❌'}`);
  console.log(`  GOOGLE_API_KEY: ${process.env.GOOGLE_API_KEY ? '✅' : '❌'}`);

  // ── 健康检查：启动时轻量探测飞书连通性 ──────────────────────────────────
  setImmediate(() => {
    try {
      runCli(['info'], 8000);
    } catch {
      console.warn('[mem-feishu] ⚠️  飞书 Token 无效，插件可能无法正常工作。请检查 openclaw.json5 中的 FEISHU_APP_TOKEN 配置。');
    }
  });

  // ── Hook: 新对话开始 → 注入近期记忆 ──────────────────────────────────
  // 监听 command:new 或 session_start，将最近 5 条记忆注入上下文
  const injectRecentMemories = () => {
    const memBlock = runCli(['recent', '--limit', '5', '--format']);
    return memBlock.trim() ? { prependSystemContext: memBlock.trim() } : {};
  };

  api.on?.('command:new', injectRecentMemories);
  api.on?.('session_start', injectRecentMemories);

  // ── Hook: 对话结束 → 自动保存 ──────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api.on?.('agent_end', async (event: any) => {
    const messages: Array<{ role: string; content: string }> = event?.messages ?? [];
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    if (last?.content && last.content.length >= 100) {
      const content = last.content.slice(0, 500);
      const project = getProjectName();
      setImmediate(() => {
        runCli([
          'save',
          '--content', content,
          '--tags', `自动,${project}`,
          '--source', 'openclaw-auto',
          '--project', project,
        ], 30000);
      });
    }
  });

  // ── Tool 1：主动语义搜索（Agent 主动调用）────────────────────────────
  api.registerTool({
    name: 'search_feishu_memory',
    description: '当你需要回忆过去的对话、用户偏好或历史信息时，调用此工具搜索记忆库。',
    parameters: Type.Object({
      query: Type.String({ description: '搜索关键词或描述，用自然语言表达需要回忆的内容' }),
      limit: Type.Optional(Type.Number({ description: '返回条数（默认 10）' })),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async execute(_id: string, params: { query: string; limit?: number }) {
      try {
        const out = runCli(['search', '--query', params.query, '--limit', String(params.limit ?? 10), '--format']);
        return { content: [{ type: 'text', text: out || '未找到相关记忆' }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: friendlyError(e, '搜索记忆') }] };
      }
    },
  });

  // ── Tool 2：手动保存（用户说「记住」时调用）──────────────────────────
  api.registerTool({
    name: 'feishu_memory_save',
    description: '将重要信息保存到飞书记忆库。当用户要求记住某件事时调用。',
    parameters: Type.Object({
      content: Type.String({ description: '要保存的记忆内容（精炼后的核心信息）' }),
      tags: Type.Optional(Type.Array(Type.String(), { description: '分类标签数组，每个标签是独立的字符串元素。正确：["决策", "配置"]。错误：["决策,配置"]（禁止在单个字符串内用逗号/顿号分隔多个标签）。推荐标签：决策/偏好/配置/Bug修复/架构/工作流/技术选型/用户信息。数量 1-4 个。' })),
      source: Type.Optional(Type.String({ description: '记忆来源，填写你自己的 Agent 名称（如 claude-code、cursor、copilot）。这个字段用于标识是哪个 AI Agent 写入的记忆，请务必填写，不要留空。' })),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async execute(_id: string, params: { content: string; tags?: string[]; source?: string }) {
      try {
        const tags = params.tags ?? [];
        const project = getProjectName();
        const source = params.source ?? 'openclaw';
        const out = runCli([
          'save',
          '--content', params.content,
          '--tags', [...tags, project].join(','),
          '--source', source,
          '--project', project,
        ]);
        let ok = false;
        try { ok = JSON.parse(out).ok; } catch { /* ignore */ }
        return { content: [{ type: 'text', text: ok ? '✓ 已保存到飞书记忆库' : `保存失败：${out}` }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: friendlyError(e, '保存记忆') }] };
      }
    },
  });

  // ── Tool 3：最近记忆列表（可选）──────────────────────────────────────
  api.registerTool(
    {
      name: 'feishu_memory_recent',
      description: '获取最近保存的记忆列表，用于概览历史记录。',
      parameters: Type.Object({
        limit: Type.Optional(Type.Number({ description: '返回条数（默认 20）' })),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async execute(_id: string, params: { limit?: number }) {
        try {
          const out = runCli(['recent', '--limit', String(params.limit ?? 20), '--format']);
          return { content: [{ type: 'text', text: out || '暂无记忆记录' }] };
        } catch (e) {
          return { isError: true, content: [{ type: 'text', text: friendlyError(e, '获取最近记忆') }] };
        }
      },
    },
    { optional: true },
  );

  // ── Tool 4：记忆库信息（可选）──────────────────────────────────────
  api.registerTool(
    {
      name: 'feishu_memory_info',
      description: '获取飞书记忆库的直接链接和状态。当用户询问记忆表格在哪里时调用。',
      parameters: Type.Object({}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async execute(_id: string, _params: Record<string, never>) {
        try {
          const out = runCli(['info']);
          const text = out
            ? `${out.trim()}\n\nmem-feishu 版本：v${PKG_VERSION}`
            : `mem-feishu 版本：v${PKG_VERSION}\n\n无法获取记忆库信息，请检查环境变量配置`;
          return { content: [{ type: 'text', text }] };
        } catch (e) {
          return { isError: true, content: [{ type: 'text', text: friendlyError(e, '获取记忆库信息') }] };
        }
      },
    },
    { optional: true },
  );
}
