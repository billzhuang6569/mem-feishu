#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'module';
import { saveMemory } from './memory/store.js';
import { searchMemories } from './memory/search.js';
import { getRecentMemories } from './memory/recent.js';
import { formatMemories } from './memory/format.js';
import { ensureTable, getBaseUrl, createBase } from './feishu/bitable.js';
import { tryGetAppToken, readLocalConfig } from './feishu/client.js';

const _require = createRequire(import.meta.url);
const PKG_VERSION: string = (() => {
  try {
    return (_require('../package.json') as { version: string }).version;
  } catch {
    return 'unknown';
  }
})();

const program = new Command();
program.name('mem-feishu').description('AI 记忆层 — 飞书多维表格 + 本地向量搜索').version(PKG_VERSION);

// save：保存一条记忆
program
  .command('save')
  .description('保存一条记忆到飞书多维表格')
  .requiredOption('-c, --content <text>', '记忆内容')
  .option('-t, --tags <tags>', '标签，逗号分隔（如：决策,配置）', '')
  .option('-s, --source <source>', '来源', 'manual')
  .option('-p, --project <project>', '项目名称', '')
  .action(async (opts) => {
    const tags = opts.tags ? opts.tags.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
    const memory = await saveMemory({
      content: opts.content,
      tags,
      source: opts.source,
      project: opts.project || undefined,
    });
    console.log(JSON.stringify({ ok: true, id: memory.id }));
  });

// search：向量搜索记忆
program
  .command('search')
  .description('向量搜索记忆')
  .requiredOption('-q, --query <text>', '搜索关键词')
  .option('-l, --limit <n>', '返回条数', '10')
  .option('--format', '以可读格式输出（用于注入上下文）')
  .action(async (opts) => {
    const results = await searchMemories(opts.query, parseInt(opts.limit));
    if (opts.format) {
      console.log(formatMemories(results));
    } else {
      console.log(JSON.stringify({ ok: true, data: results }));
    }
  });

// recent：获取最近记忆
program
  .command('recent')
  .description('获取最近 N 条记忆')
  .option('-l, --limit <n>', '返回条数', '20')
  .option('--format', '以可读格式输出（用于注入上下文）')
  .action(async (opts) => {
    const memories = await getRecentMemories(parseInt(opts.limit));
    if (opts.format) {
      console.log(formatMemories(memories));
    } else {
      console.log(JSON.stringify({ ok: true, data: memories }));
    }
  });

// setup：初始化飞书多维表格（自动创建 Base，无需预先填写 FEISHU_APP_TOKEN）
program
  .command('setup')
  .description('初始化飞书 AI 记忆库（无 App Token 时自动创建多维表格）')
  .action(async () => {
    // 检查是否已有 App Token
    const existingToken = tryGetAppToken();

    if (!existingToken) {
      // ── 没有 Token：自动创建新的 Bitable Base ──────────────────────────
      console.log('未检测到 FEISHU_APP_TOKEN，正在自动创建飞书多维表格…');
      console.log('（需要应用具备「多维表格」权限，详见 README）\n');
      const tableName = process.env.FEISHU_TABLE_NAME ?? 'AI 记忆库';
      try {
        const newToken = await createBase(tableName);
        const url = `https://feishu.cn/base/${newToken}`;
        console.log('✓ 飞书多维表格 Base 创建成功！\n');
        console.log(`  App Token：${newToken}`);
        console.log(`  直接链接：${url}\n`);
        console.log('  ⚠️  请将以下环境变量添加到你的 OpenClaw 配置中：');
        console.log(`  FEISHU_APP_TOKEN=${newToken}`);
        console.log('\n  Token 已缓存到本地 data/config.json，当前会话可正常使用。');
      } catch (e) {
        console.error(`\n✗ 自动创建失败：${e instanceof Error ? e.message : String(e)}`);
        console.error('\n请手动在飞书中创建多维表格，然后将 App Token 填入环境变量：');
        console.error('  FEISHU_APP_TOKEN=<你的 App Token>');
        process.exit(1);
      }
    } else {
      console.log(`检测到 App Token，使用现有多维表格…`);
    }

    // ── 创建/确认表格和字段 ────────────────────────────────────────────────
    console.log('\n正在确认「AI 记忆库」表格和字段…');
    const tableId = await ensureTable();
    const url = getBaseUrl();
    console.log(`\n✓ 「AI 记忆库」已就绪！`);
    console.log(`  飞书表格链接：${url}`);
    console.log(`  （点击链接即可在飞书中查看和管理所有记忆）`);
    console.log(`\n  table_id: ${tableId}`);
  });

// info：显示记忆库信息和飞书表格链接
program
  .command('info')
  .description('显示飞书记忆库的链接和基本信息')
  .action(() => {
    const tableName = process.env.FEISHU_TABLE_NAME ?? 'AI 记忆库';
    const appToken = tryGetAppToken();
    if (!appToken) {
      console.log('飞书记忆库尚未配置，请先运行：node dist/index.js setup');
      return;
    }
    const url = readLocalConfig().baseUrl ?? `https://feishu.cn/base/${appToken}`;
    const lines = [
      `飞书记忆库「${tableName}」v${PKG_VERSION}`,
      `直接链接：${url}`,
      '',
      '点击上方链接即可在飞书中查看、编辑、归档所有记忆。',
    ];
    console.log(lines.join('\n'));
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err) }));
  process.exit(1);
});
