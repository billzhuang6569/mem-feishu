#!/usr/bin/env node
import { Command } from 'commander';
import { saveMemory } from './memory/store.js';
import { searchMemories } from './memory/search.js';
import { getRecentMemories } from './memory/recent.js';
import { formatMemories } from './memory/format.js';
import { ensureTable, getBaseUrl } from './feishu/bitable.js';

const program = new Command();
program.name('mem-feishu').description('AI 记忆层 — 飞书多维表格 + 本地向量搜索').version('0.1.0');

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

// setup：初始化飞书多维表格
program
  .command('setup')
  .description('在飞书中创建「AI 记忆库」多维表格（含所有字段）')
  .action(async () => {
    console.log('正在初始化飞书多维表格…');
    const tableId = await ensureTable();
    const url = getBaseUrl();
    console.log(`✓ 「AI 记忆库」已就绪`);
    console.log(`  飞书表格链接：${url}`);
    console.log(`  table_id: ${tableId}`);
  });

// info：显示记忆库信息和飞书表格链接
program
  .command('info')
  .description('显示飞书记忆库的链接和基本信息')
  .action(async () => {
    const url = getBaseUrl();
    const appToken = process.env.FEISHU_APP_TOKEN ?? '（未配置）';
    const tableName = process.env.FEISHU_TABLE_NAME ?? 'AI 记忆库';
    const lines = [
      `飞书记忆库「${tableName}」`,
      `直接链接：${url}`,
      `App Token：${appToken}`,
      '',
      '提示：点击上方链接可在飞书中查看、编辑和管理所有记忆。',
    ];
    console.log(lines.join('\n'));
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err) }));
  process.exit(1);
});
