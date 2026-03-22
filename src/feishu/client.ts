import * as lark from '@larksuiteoapi/node-sdk';

let _client: lark.Client | null = null;

export function getClient(): lark.Client {
  if (!_client) {
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error('缺少环境变量：FEISHU_APP_ID 或 FEISHU_APP_SECRET');
    }
    _client = new lark.Client({ appId, appSecret });
  }
  return _client;
}

export function getAppToken(): string {
  const token = process.env.FEISHU_APP_TOKEN;
  if (!token) {
    throw new Error('缺少环境变量：FEISHU_APP_TOKEN（多维表格 Base App Token）');
  }
  return token;
}
