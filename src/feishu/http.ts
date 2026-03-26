import { fetch as undiciFetch, Agent } from 'undici';

// 强制不走代理的直连 Agent，无视 HTTPS_PROXY 等环境变量
const directAgent = new Agent();

// 通用飞书请求函数，HTTP 或业务层错误均抛出含详细信息的 Error
export async function feishuFetch(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
): Promise<unknown> {
  const res = await undiciFetch(url, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.body,
    dispatcher: directAgent,
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    // 非 JSON 响应
  }

  const hasCode = data !== null && typeof data === 'object' && 'code' in (data as object);
  const isJsonOk = hasCode && (data as { code: number }).code === 0;

  if (!res.ok || (hasCode && !isJsonOk)) {
    throw new Error(`Feishu API Error [HTTP ${res.status}]: ${text}`);
  }

  return data;
}

// Token 缓存
let cachedToken = '';
let tokenExpireAt = 0;

export async function getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  if (cachedToken && Date.now() < tokenExpireAt) {
    return cachedToken;
  }

  const data = (await feishuFetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    }
  )) as { tenant_access_token: string; expire: number };

  cachedToken = data.tenant_access_token;
  // expire 是秒，提前 5 分钟过期
  tokenExpireAt = Date.now() + data.expire * 1000 - 300_000;
  return cachedToken;
}
