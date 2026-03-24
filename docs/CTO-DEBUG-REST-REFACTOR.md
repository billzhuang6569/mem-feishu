# CTO 指导：绕过飞书 SDK，改用原生 HTTP 请求直连飞书 (v2)

## 1. 为什么必须抛弃飞书 SDK？

经过多轮排查，我们确认：在某些复杂的 Node.js 代理环境（或特定的 VPS 网络栈）下，飞书官方的 `@larksuiteoapi/node-sdk` 内部的 `TokenManager` 和底层的请求链路会**无视我们在应用层注入的 `proxy: false` 配置**，强行读取系统环境变量（如 `HTTPS_PROXY`）并走代理，导致请求被飞书网关以 `400 The plain HTTP request was sent to HTTPS port` 拒绝。

**作为 CTO，我的决定是：停止在 SDK 的黑盒里打转，直接用原生的 `fetch`（或 `axios`）调用飞书的 REST API。**

飞书的 API 非常简单，我们只需要自己维护一个 `tenant_access_token`，然后带上这个 Token 去请求 Bitable 的接口即可。这样每一行网络请求代码都在我们的绝对控制之下，彻底杜绝代理劫持。

## 2. 核心 HTTP 客户端封装（直接复制使用）

在 `src/feishu/` 目录下新建一个 `http.ts`，用原生的 `undici fetch` 封装飞书请求，**强制禁用代理，并透传详细的错误信息给 Agent**。

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

// 封装一个通用的飞书请求函数，增强错误处理
export async function feishuFetch(url: string, options: any = {}) {
  const res = await undiciFetch(url, {
    ...options,
    dispatcher: directAgent, // 强制使用直连 Agent
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const data = await res.json().catch(() => null);

  // 飞书 API 成功时 HTTP 状态码通常是 200，但业务 code 可能不是 0
  if (!res.ok || (data && data.code !== 0)) {
    const errorMsg = data ? JSON.stringify(data) : await res.text();
    // 抛出包含详细飞书报错信息的 Error，方便 Agent 捕获和诊断
    throw new Error(`Feishu API Error [HTTP ${res.status}]: ${errorMsg}`);
  }

  return data;
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

  // 注意：获取 token 接口的返回值中，token 直接在顶层，不在 data 里
  cachedToken = data.tenant_access_token;
  // expire 是秒，转换为毫秒，并提前 5 分钟（300000ms）过期
  tokenExpireAt = Date.now() + (data.expire * 1000) - 300000;
  
  return cachedToken;
}
```

## 3. 替换 SDK 调用的 API 映射表

我已经通过 Context7 查证了飞书官方文档，以下是你们需要替换的所有 API 的精确写法和参数。

### 3.1 创建多维表格 (Create Base)
- **Method**: `POST`
- **URL**: `https://open.feishu.cn/open-apis/bitable/v1/apps`
- **Body**: `{ "name": "表格名称", "folder_token": "" }`
- **Response**: `res.data.app.app_token`

### 3.2 创建数据表 (Create Table)
- **Method**: `POST`
- **URL**: `https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables`
- **Body**: 
  ```json
  {
    "table": {
      "default_view_name": "Grid",
      "fields": [
        { "field_name": "字段名", "type": 1 }
      ]
    }
  }
  ```
- **Response**: `res.data.table_id`

### 3.3 列出数据表 (List Tables)
- **Method**: `GET`
- **URL**: `https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables`
- **Response**: `res.data.items` (数组，包含 `table_id` 和 `name`)

### 3.4 创建记录 (Create Record)
- **Method**: `POST`
- **URL**: `https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records`
- **Body**: `{ "fields": { "字段名": "值" } }`
- **Response**: `res.data.record.record_id`

### 3.5 批量获取记录 (Batch Get Records)
- **Method**: `POST`
- **URL**: `https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/batch_get`
- **Body**: `{ "record_ids": ["rec1", "rec2"] }`
- **Response**: `res.data.records`

### 3.6 搜索记录 (Search Records) - 替代原有的 `kwSearch`
- **Method**: `POST`
- **URL**: `https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/search?page_size=10`
- **Body**:
  ```json
  {
    "filter": {
      "conjunction": "and",
      "conditions": [
        { "field_name": "状态", "operator": "is", "value": ["活跃"] },
        { "field_name": "内容", "operator": "contains", "value": ["搜索词"] }
      ]
    },
    "sort": [
      { "field_name": "创建时间", "desc": true }
    ]
  }
  ```
- **Response**: `res.data.items`

## 4. 总结

1. **彻底删除 `@larksuiteoapi/node-sdk` 依赖**。
2. 使用 `undici` 的 `Agent` 强制直连，绕过任何环境变量代理。
3. `feishuFetch` 已经封装了完善的错误抛出机制，如果飞书返回 400 或 125400x 错误码，Agent 会在日志中看到完整的 JSON 报错信息，方便排查。
4. 按照上述 API 映射表，把 `src/feishu/bitable.ts` 和 `src/backend/FeishuMemoryBackend.ts` 中的 CRUD 操作全部替换为 `feishuFetch`。

这不仅能彻底解决 400 代理报错，还能让我们的代码更轻量、更可控。请 AI 开发团队立即执行此重构。
