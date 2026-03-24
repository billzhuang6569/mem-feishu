import * as lark from '@larksuiteoapi/node-sdk';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '../../data/config.json');

// 本地配置文件（存储自动创建的 App Token 等）
interface LocalConfig {
  appToken?: string;
  baseUrl?: string;
  createdAt?: number;
}

export function readLocalConfig(): LocalConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as LocalConfig;
    }
  } catch { /* ignore */ }
  return {};
}

export function writeLocalConfig(patch: Partial<LocalConfig>): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const existing = readLocalConfig();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...existing, ...patch }, null, 2));
}

let _client: lark.Client | null = null;

export function getClient(): lark.Client {
  if (!_client) {
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error('缺少环境变量：FEISHU_APP_ID 或 FEISHU_APP_SECRET\n请先运行 setup 完成配置。');
    }
    // proxy: false 强制飞书请求直连，避免本地 http 代理将 HTTPS 请求降级为明文
    // Google Embedding API 仍通过 undici ProxyAgent 走代理（见 embed.ts）
    const httpInstance = axios.create({ proxy: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _client = new lark.Client({ appId, appSecret, httpInstance: httpInstance as any });
  }
  return _client;
}

// 获取 App Token：优先环境变量，其次本地配置文件
export function getAppToken(): string {
  const fromEnv = process.env.FEISHU_APP_TOKEN;
  if (fromEnv) return fromEnv;
  const fromConfig = readLocalConfig().appToken;
  if (fromConfig) return fromConfig;
  throw new Error(
    '未找到飞书多维表格 App Token。\n' +
    '请运行 setup 命令自动创建，或手动设置 FEISHU_APP_TOKEN 环境变量。'
  );
}

// 尝试获取 App Token（不抛错，返回 undefined）
export function tryGetAppToken(): string | undefined {
  try { return getAppToken(); } catch { return undefined; }
}
