# CTO 指导：绕过飞书 SDK，改用原生 HTTP 请求直连飞书

## 1. 为什么必须抛弃飞书 SDK？

经过多轮排查，我们确认：在某些复杂的 Node.js 代理环境（或特定的 VPS 网络栈）下，飞书官方的 `@larksuiteoapi/node-sdk` 内部的 `TokenManager` 和底层的请求链路会**无视我们在应用层注入的 `proxy: false` 配置**，强行读取系统环境变量（如 `HTTPS_PROXY`）并走代理，导致请求被飞书网关以 `400 The plain HTTP request was sent to HTTPS port` 拒绝。

**作为 CTO，我的决定是：停止在 SDK 的黑盒里打转，直接用原生的 `fetch`（或 `axios`）调用飞书的 REST API。**

飞书的 API 非常简单，我们只需要自己维护一个 `tenant_access_token`，然后带上这个 Token 去请求 Bitable 的接口即可。这样每一行网络请求代码都在我们的绝对控制之下，彻底杜绝代理劫持。

## 2. 改造范围

目前代码中有两处使用了飞书 SDK，都需要替换：
1. **旧版 CLI 链路**：`src/feishu/client.ts` 和 `src/feishu/bitable.ts`（这是 `setup` 命令报错的根源）
2. **新版插件链路**：`src/backend/FeishuMemoryBackend.ts`

## 3. 核心 HTTP 客户端封装（直接复制使用）

在 `src/feishu/` 目录下新建一个 `http.ts`，用原生的 `undici fetch` 封装飞书请求，**强制禁用代理**。

```typescript
// src/feishu/http.ts
import { fetch as undiciFetch, Agent } from 'undici';

// 创建一个强制不走代理的 Agent
// 这样即使系统有 HTTP_PROXY 环境变量，undici 也会忽略它，直接直连飞书
const directAgent = new Agent({
  connect: {
    rejectUnauthorized: false // 可选：如果 VPS 的根证书有问题，可以加上这个
  }
});

// 封装一个通用的飞书请求函数
export async function feishuFetch(url: string, options: any = {}) {
  const res = await undiciFetch(url, {
    ...options,
    dispatcher: directAgent, // 强制使用直连 Agent
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Feishu API Error ${res.status}: ${body}`);
  }

  return res.json();
}

// 维护一个全局的 Token 缓存
let cachedToken = '';
let tokenExpireAt = 0;

export async function getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  // 如果 Token 还有效（提前 5 分钟过期），直接返回
  if (cachedToken && Date.now() < tokenExpireAt) {
    return cachedToken;
  }

  const url = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
  const data = await feishuFetch(url, {
    method: 'POST',
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret
    })
  });

  if (data.code !== 0) {
    throw new Error(`获取 tenant_access_token 失败: ${data.msg}`);
  }

  cachedToken = data.tenant_access_token;
  // expire_in 是秒，转换为毫秒，并提前 5 分钟（300000ms）过期
  tokenExpireAt = Date.now() + (data.expire_in * 1000) - 300000;
  
  return cachedToken;
}
```

## 4. 替换 `src/feishu/bitable.ts` 中的 SDK 调用

将 `bitable.ts` 中所有依赖 `client.bitable.xxx` 的代码，替换为直接调用 REST API。

例如，创建 Base 的接口：
```typescript
// 旧代码
const res = await client.bitable.app.create({
  data: { name, folder_token: '' },
});

// 新代码
const token = await getTenantAccessToken(process.env.FEISHU_APP_ID!, process.env.FEISHU_APP_SECRET!);
const res = await feishuFetch('https://open.feishu.cn/open-apis/bitable/v1/apps', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ name, folder_token: '' })
});
const appToken = res.data.app.app_token;
```

获取表格列表的接口：
```typescript
// 新代码
const token = await getTenantAccessToken(process.env.FEISHU_APP_ID!, process.env.FEISHU_APP_SECRET!);
const res = await feishuFetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`, {
  method: 'GET',
  headers: { 'Authorization': `Bearer ${token}` }
});
const tables = res.data.items;
```

## 5. 替换 `FeishuMemoryBackend.ts` 中的 SDK 调用

同理，在 `FeishuMemoryBackend.ts` 中，移除 `this.client = new lark.Client(...)`，改为在每次请求前获取 Token，然后调用 `feishuFetch`。

例如，创建记录的接口：
```typescript
// 新代码
const token = await getTenantAccessToken(this.config.FEISHU_APP_ID, this.config.FEISHU_APP_SECRET);
const res = await feishuFetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${this.appToken}/tables/${tableId}/records`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ fields })
});
const recordId = res.data.record.record_id;
```

## 6. 总结

1. **彻底删除 `@larksuiteoapi/node-sdk` 依赖**。
2. 使用 `undici` 的 `Agent` 强制直连，绕过任何环境变量代理。
3. 飞书的 Bitable API 文档地址：[https://open.feishu.cn/document/server-docs/docs/bitable-v1/app/create](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app/create)
4. 按照上述模式，把 CRUD 操作全部替换为 `feishuFetch`。

这不仅能彻底解决 400 代理报错，还能让我们的代码更轻量、更可控。请 AI 开发团队立即执行此重构。
