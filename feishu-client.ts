export interface FeishuAuthConfig {
  appId: string;
  appSecret: string;
}

export interface FeishuCreateAppResponse {
  appToken: string;
  defaultTableId?: string;
  url?: string;
}

export interface FeishuTable {
  tableId: string;
  name: string;
}

export interface FeishuField {
  fieldId: string;
  fieldName: string;
  type: number;
}

export interface FeishuRecord {
  recordId: string;
  fields: Record<string, unknown>;
}

interface FeishuApiEnvelope<T> {
  code: number;
  msg: string;
  data?: T;
}

interface TenantAccessTokenResponse {
  code: number;
  msg: string;
  tenant_access_token: string;
  expire: number;
}

const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";
const CONTENT_TYPE = "application/json; charset=utf-8";
const MAX_RETRY = 3;

export class FeishuPermissionError extends Error {}
export class FeishuApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number,
    readonly msg: string,
    readonly method: string,
    readonly path: string
  ) {
    super(message);
  }
}

export class FeishuClient {
  private token?: string;
  private tokenExpireAt = 0;

  constructor(private readonly auth: FeishuAuthConfig) {}

  async createBitableApp(name: string): Promise<FeishuCreateAppResponse> {
    const data = await this.request<{ app: { app_token: string; default_table_id?: string; url?: string } }>(
      "POST",
      "/bitable/v1/apps",
      { name }
    );
    return {
      appToken: data.app.app_token,
      defaultTableId: data.app.default_table_id,
      url: data.app.url
    };
  }

  async listTables(appToken: string): Promise<FeishuTable[]> {
    const tables: FeishuTable[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams();
      query.set("page_size", "100");
      if (pageToken) {
        query.set("page_token", pageToken);
      }
      const data = await this.request<{
        items?: Array<{ table_id: string; name: string }>;
        has_more?: boolean;
        page_token?: string;
      }>("GET", `/bitable/v1/apps/${appToken}/tables?${query.toString()}`);
      for (const item of data.items ?? []) {
        tables.push({ tableId: item.table_id, name: item.name });
      }
      pageToken = data.has_more ? data.page_token : undefined;
    } while (pageToken);
    return tables;
  }

  async createTable(appToken: string, tableName: string): Promise<FeishuTable> {
    const data = await this.request<{
      table?: { table_id?: string; name?: string };
      table_id?: string;
      name?: string;
      default_table_id?: string;
    }>(
      "POST",
      `/bitable/v1/apps/${appToken}/tables`,
      { table: { name: tableName } }
    );
    const tableId = data.table?.table_id ?? data.table_id ?? data.default_table_id;
    const name = data.table?.name ?? data.name ?? tableName;
    if (!tableId) {
      throw new Error(`Feishu createTable response missing table id: ${JSON.stringify(data)}`);
    }
    return {
      tableId,
      name
    };
  }

  async listFields(appToken: string, tableId: string): Promise<FeishuField[]> {
    const fields: FeishuField[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams();
      query.set("page_size", "100");
      if (pageToken) {
        query.set("page_token", pageToken);
      }
      const data = await this.request<{
        items?: Array<{ field_id: string; field_name: string; type: number }>;
        has_more?: boolean;
        page_token?: string;
      }>("GET", `/bitable/v1/apps/${appToken}/tables/${tableId}/fields?${query.toString()}`);
      for (const item of data.items ?? []) {
        fields.push({
          fieldId: item.field_id,
          fieldName: item.field_name,
          type: item.type
        });
      }
      pageToken = data.has_more ? data.page_token : undefined;
    } while (pageToken);
    return fields;
  }

  async createField(
    appToken: string,
    tableId: string,
    fieldName: string,
    type: number
  ): Promise<FeishuField> {
    const data = await this.request<{ field: { field_id: string; field_name: string; type: number } }>(
      "POST",
      `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
      { field_name: fieldName, type }
    );
    return {
      fieldId: data.field.field_id,
      fieldName: data.field.field_name,
      type: data.field.type
    };
  }

  async createRecord(
    appToken: string,
    tableId: string,
    fields: Record<string, unknown>
  ): Promise<FeishuRecord> {
    const data = await this.request<{ record: { record_id: string; fields: Record<string, unknown> } }>(
      "POST",
      `/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
      { fields }
    );
    return {
      recordId: data.record.record_id,
      fields: data.record.fields
    };
  }

  async updateRecord(
    appToken: string,
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>
  ): Promise<FeishuRecord> {
    const data = await this.request<{ record: { record_id: string; fields: Record<string, unknown> } }>(
      "PUT",
      `/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
      { fields }
    );
    return {
      recordId: data.record.record_id,
      fields: data.record.fields
    };
  }

  async deleteRecord(appToken: string, tableId: string, recordId: string): Promise<void> {
    await this.request("DELETE", `/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`);
  }

  async listRecords(
    appToken: string,
    tableId: string,
    pageSize = 500
  ): Promise<FeishuRecord[]> {
    const records: FeishuRecord[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams();
      query.set("page_size", String(pageSize));
      if (pageToken) {
        query.set("page_token", pageToken);
      }
      const data = await this.request<{
        items?: Array<{ record_id: string; fields: Record<string, unknown> }>;
        has_more?: boolean;
        page_token?: string;
      }>("GET", `/bitable/v1/apps/${appToken}/tables/${tableId}/records?${query.toString()}`);
      for (const item of data.items ?? []) {
        records.push({ recordId: item.record_id, fields: item.fields });
      }
      pageToken = data.has_more ? data.page_token : undefined;
    } while (pageToken);
    return records;
  }

  async addCollaboratorByEmail(appToken: string, email: string): Promise<void> {
    await this.request(
      "POST",
      `/drive/v1/permissions/${appToken}/members?type=bitable`,
      {
        member_type: "email",
        member_id: email,
        perm: "full_access"
      }
    );
  }

  private async request<TData = Record<string, unknown>>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    retryCount = 0
  ): Promise<TData> {
    const token = await this.getTenantAccessToken();
    const response = await fetch(`${FEISHU_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": CONTENT_TYPE
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const json = (await response.json()) as FeishuApiEnvelope<TData>;
    const isRateLimited = response.status === 429 || json.code === 2001254290;
    if (isRateLimited && retryCount < MAX_RETRY) {
      await this.wait(2 ** retryCount * 500);
      return this.request(method, path, body, retryCount + 1);
    }

    const isPermissionError = response.status === 403 || String(json.code).startsWith("403");
    if (isPermissionError) {
      throw new FeishuPermissionError(
        "飞书权限不足，请检查应用是否已被添加为文档应用并授予可管理权限。"
      );
    }

    if (!response.ok || json.code !== 0) {
      throw new FeishuApiError(
        `Feishu API error: status=${response.status}, code=${json.code}, msg=${json.msg}, method=${method}, path=${path}`,
        response.status,
        json.code,
        json.msg,
        method,
        path
      );
    }

    return (json.data ?? ({} as TData)) as TData;
  }

  private async getTenantAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.token && now < this.tokenExpireAt - 30 * 60 * 1000) {
      return this.token;
    }

    const response = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: {
        "Content-Type": CONTENT_TYPE
      },
      body: JSON.stringify({
        app_id: this.auth.appId,
        app_secret: this.auth.appSecret
      })
    });
    const json = (await response.json()) as TenantAccessTokenResponse;
    if (!response.ok || json.code !== 0 || !json.tenant_access_token) {
      throw new Error(`Failed to get tenant_access_token: status=${response.status}, code=${json.code}, msg=${json.msg}`);
    }
    this.token = json.tenant_access_token;
    this.tokenExpireAt = Date.now() + json.expire * 1000;
    return this.token;
  }

  private async wait(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
