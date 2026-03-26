import { feishuFetch, getTenantAccessToken } from './http.js';
import { getCredentials, getAppToken, writeLocalConfig } from './client.js';
import { Memory, MemoryType, MemoryState, MemoryInput, FIELD, TABLE_NAME } from './types.js';
import { v4 as uuidv4 } from 'uuid';

const BASE = 'https://open.feishu.cn/open-apis';

// 飞书字段类型枚举（Bitable API）
const FieldType = {
  TEXT: 1,
  NUMBER: 2,
  SELECT: 3,
  MULTISELECT: 4,
  DATE: 5,
  CHECKBOX: 7,
};

async function authHeaders(): Promise<Record<string, string>> {
  const { appId, appSecret } = getCredentials();
  const token = await getTenantAccessToken(appId, appSecret);
  return { Authorization: `Bearer ${token}` };
}

// 自动创建飞书多维表格 Base，返回 App Token
export async function createBase(name: string): Promise<string> {
  const headers = await authHeaders();
  const res = (await feishuFetch(`${BASE}/bitable/v1/apps`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, folder_token: '' }),
  })) as { data: { app: { app_token: string } } };

  const appToken = res.data?.app?.app_token;
  if (!appToken) throw new Error('创建飞书多维表格 Base 失败，请检查应用权限（bitable:app）');
  const url = `https://feishu.cn/base/${appToken}`;
  writeLocalConfig({ appToken, baseUrl: url, createdAt: Date.now() });
  return appToken;
}

// 确保多维表格和字段存在，返回 table_id
export async function ensureTable(): Promise<string> {
  const headers = await authHeaders();
  const appToken = getAppToken();

  // 列出所有表格，查找目标表格
  const listRes = (await feishuFetch(`${BASE}/bitable/v1/apps/${appToken}/tables`, {
    headers,
  })) as { data: { items: Array<{ table_id: string; name: string }> } };

  const tables = listRes.data?.items ?? [];
  const existing = tables.find((t) => t.name === TABLE_NAME);
  if (existing?.table_id) {
    await ensureNewFields(appToken, existing.table_id, headers);
    return existing.table_id;
  }

  // 创建表格
  const createRes = (await feishuFetch(`${BASE}/bitable/v1/apps/${appToken}/tables`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ table: { name: TABLE_NAME } }),
  })) as { data: { table_id: string } };

  const tableId = createRes.data?.table_id;
  if (!tableId) throw new Error('创建多维表格失败');

  // 获取默认字段，将其重命名为「记忆ID」
  const fieldsRes = (await feishuFetch(
    `${BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    { headers }
  )) as { data: { items: Array<{ field_id: string; field_name: string }> } };

  const defaultField = fieldsRes.data?.items?.[0];
  if (defaultField?.field_id) {
    await feishuFetch(
      `${BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields/${defaultField.field_id}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ field_name: FIELD.ID, type: FieldType.TEXT }),
      }
    );
  }

  // 依次创建剩余字段（v2.0 包含新字段）
  const fieldsToCreate = [
    { field_name: FIELD.CONTENT, type: FieldType.TEXT },
    { field_name: FIELD.TAGS, type: FieldType.MULTISELECT },
    { field_name: FIELD.SOURCE, type: FieldType.SELECT },
    { field_name: FIELD.STATE, type: FieldType.SELECT },
    { field_name: FIELD.MEMORY_TYPE, type: FieldType.SELECT },
    { field_name: FIELD.PROJECT, type: FieldType.TEXT },
    { field_name: FIELD.SESSION_ID, type: FieldType.TEXT },
    { field_name: FIELD.SUPERSEDED_BY, type: FieldType.TEXT },
    { field_name: FIELD.CREATED_AT, type: FieldType.DATE },
    { field_name: FIELD.UPDATED_AT, type: FieldType.DATE },
  ];

  for (const field of fieldsToCreate) {
    await feishuFetch(`${BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, {
      method: 'POST',
      headers,
      body: JSON.stringify(field),
    });
  }

  return tableId;
}

// 新增一条记忆记录，返回 Memory（含飞书 record_id）
export async function addRecord(tableId: string, input: MemoryInput): Promise<Memory> {
  const headers = await authHeaders();
  const appToken = getAppToken();
  const id = uuidv4();
  const now = Date.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields: Record<string, any> = {
    [FIELD.ID]: id,
    [FIELD.CONTENT]: input.content,
    [FIELD.TAGS]: input.tags ?? [],
    [FIELD.SOURCE]: input.source ?? 'manual',
    [FIELD.STATE]: '活跃',
    [FIELD.MEMORY_TYPE]: input.memoryType ?? 'insight',
    [FIELD.PROJECT]: input.project ?? '',
    [FIELD.SESSION_ID]: input.sessionId ?? '',
    [FIELD.SUPERSEDED_BY]: '',
    [FIELD.CREATED_AT]: now,
    [FIELD.UPDATED_AT]: now,
  };

  const res = (await feishuFetch(
    `${BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ fields }),
    }
  )) as { data: { record: { record_id: string } } };

  const recordId = res.data?.record?.record_id;

  return {
    id,
    content: input.content,
    tags: input.tags ?? [],
    source: input.source ?? 'manual',
    state: '活跃',
    memoryType: input.memoryType ?? 'insight',
    project: input.project,
    sessionId: input.sessionId,
    createdAt: now,
    updatedAt: now,
    recordId,
  };
}

// 按飞书 record_id 列表批量获取完整记录（batch_get）
export async function getRecordsByIds(tableId: string, recordIds: string[]): Promise<Memory[]> {
  if (recordIds.length === 0) return [];
  const headers = await authHeaders();
  const appToken = getAppToken();

  const res = (await feishuFetch(
    `${BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_get`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ record_ids: recordIds }),
    }
  )) as { data: { records: Array<{ record_id: string; fields: Record<string, unknown> }> } };

  return (res.data?.records ?? []).map((r) => parseFields(r.fields ?? {}, r.record_id));
}

// 获取最近 N 条活跃记忆（按创建时间倒序，支持自动翻页拉取全量）
export async function listRecent(tableId: string, limit: number): Promise<Memory[]> {
  const headers = await authHeaders();
  const appToken = getAppToken();

  const allMemories: Memory[] = [];
  let pageToken: string | undefined = undefined;
  let hasMore = true;

  while (hasMore && allMemories.length < limit) {
    const pageSize = Math.min(limit - allMemories.length, 500);
    const urlParams = new URLSearchParams({ page_size: String(pageSize) });
    if (pageToken) urlParams.set('page_token', pageToken);

    const res = (await feishuFetch(
      `${BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records/search?${urlParams}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sort: [{ field_name: FIELD.CREATED_AT, desc: true }],
          filter: {
            conjunction: 'and',
            conditions: [{ field_name: FIELD.STATE, operator: 'is', value: ['活跃'] }],
          },
        }),
      }
    )) as {
      data: {
        items: Array<{ record_id: string; fields: Record<string, unknown> }>;
        has_more: boolean;
        page_token: string;
      };
    };

    for (const item of res.data?.items ?? []) {
      allMemories.push(parseFields(item.fields ?? {}, item.record_id));
    }

    hasMore = res.data?.has_more ?? false;
    pageToken = res.data?.page_token ?? undefined;
  }

  return allMemories;
}

// 更新记忆状态/标签/类型等字段
export async function updateRecord(
  tableId: string,
  recordId: string,
  patch: Partial<{ state: MemoryState; tags: string[]; memoryType: MemoryType; supersededBy: string }>
): Promise<void> {
  const headers = await authHeaders();
  const appToken = getAppToken();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields: Record<string, any> = { [FIELD.UPDATED_AT]: Date.now() };
  if (patch.state !== undefined) fields[FIELD.STATE] = patch.state;
  if (patch.tags !== undefined) fields[FIELD.TAGS] = patch.tags;
  if (patch.memoryType !== undefined) fields[FIELD.MEMORY_TYPE] = patch.memoryType;
  if (patch.supersededBy !== undefined) fields[FIELD.SUPERSEDED_BY] = patch.supersededBy;

  await feishuFetch(
    `${BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({ fields }),
    }
  );
}

// 软删除
export async function deleteRecord(tableId: string, recordId: string): Promise<void> {
  await updateRecord(tableId, recordId, { state: '已删除' });
}

// 将多维表格所有权转移给指定用户
export async function transferOwner(
  memberType: 'openid' | 'userid' | 'email',
  memberId: string,
): Promise<void> {
  const headers = await authHeaders();
  const appToken = getAppToken();

  const params = new URLSearchParams({
    type: 'bitable',
    remove_old_owner: 'false',
    stay_put: 'true',
    old_owner_perm: 'full_access',
  });

  await feishuFetch(
    `${BASE}/drive/v1/permissions/${appToken}/members/transfer_owner?${params}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ member_type: memberType, member_id: memberId }),
    }
  );
}

// 获取多维表格的直接访问链接
export function getBaseUrl(): string {
  const appToken = getAppToken();
  return `https://feishu.cn/base/${appToken}`;
}

// 对已存在的旧表补充 v2.0 新字段（幂等，字段已存在时跳过）
async function ensureNewFields(
  appToken: string,
  tableId: string,
  headers: Record<string, string>
): Promise<void> {
  const fieldsRes = (await feishuFetch(
    `${BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    { headers }
  )) as { data: { items: Array<{ field_name: string }> } };

  const existingNames = new Set((fieldsRes.data?.items ?? []).map((f) => f.field_name ?? ''));

  const newFields = [
    { field_name: FIELD.MEMORY_TYPE, type: FieldType.SELECT },
    { field_name: FIELD.SESSION_ID, type: FieldType.TEXT },
    { field_name: FIELD.SUPERSEDED_BY, type: FieldType.TEXT },
    { field_name: FIELD.UPDATED_AT, type: FieldType.DATE },
  ];

  for (const field of newFields) {
    if (!existingNames.has(field.field_name)) {
      try {
        await feishuFetch(`${BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, {
          method: 'POST',
          headers,
          body: JSON.stringify(field),
        });
      } catch { /* 忽略已存在的情况 */ }
    }
  }
}

// 将飞书字段 map 转换为 Memory
function parseFields(fields: Record<string, unknown>, recordId?: string): Memory {
  const tagsRaw = fields[FIELD.TAGS];
  const tags: string[] = Array.isArray(tagsRaw)
    ? tagsRaw.map((t: unknown) => (typeof t === 'object' && t !== null && 'text' in t ? String((t as { text: unknown }).text) : String(t)))
    : [];

  const sourceRaw = fields[FIELD.SOURCE];
  const source = typeof sourceRaw === 'object' && sourceRaw !== null && 'text' in sourceRaw
    ? String((sourceRaw as { text: unknown }).text)
    : String(sourceRaw ?? 'manual');

  const stateRaw = fields[FIELD.STATE];
  const state = typeof stateRaw === 'object' && stateRaw !== null && 'text' in stateRaw
    ? String((stateRaw as { text: unknown }).text) as MemoryState
    : (String(stateRaw ?? '活跃') as MemoryState);

  const contentRaw = fields[FIELD.CONTENT];
  const content = Array.isArray(contentRaw)
    ? contentRaw.map((c: unknown) => (typeof c === 'object' && c !== null && 'text' in c ? String((c as { text: unknown }).text) : String(c))).join('')
    : String(contentRaw ?? '');

  const idRaw = fields[FIELD.ID];
  const id = Array.isArray(idRaw)
    ? idRaw.map((c: unknown) => (typeof c === 'object' && c !== null && 'text' in c ? String((c as { text: unknown }).text) : String(c))).join('')
    : String(idRaw ?? recordId ?? '');

  const projectRaw = fields[FIELD.PROJECT];
  const project = Array.isArray(projectRaw)
    ? projectRaw.map((c: unknown) => (typeof c === 'object' && c !== null && 'text' in c ? String((c as { text: unknown }).text) : String(c))).join('')
    : String(projectRaw ?? '');

  const memTypeRaw = fields[FIELD.MEMORY_TYPE];
  const memTypeStr = typeof memTypeRaw === 'object' && memTypeRaw !== null && 'text' in memTypeRaw
    ? String((memTypeRaw as { text: unknown }).text)
    : String(memTypeRaw ?? '');
  const memoryType: MemoryType = memTypeStr === 'insight' ? 'insight' : 'pinned';

  const getText = (raw: unknown): string => {
    if (Array.isArray(raw)) {
      return raw.map((c: unknown) => (typeof c === 'object' && c !== null && 'text' in c ? String((c as { text: unknown }).text) : String(c))).join('');
    }
    return String(raw ?? '');
  };

  return {
    id,
    content,
    tags,
    source,
    state,
    memoryType,
    project: project || undefined,
    sessionId: getText(fields[FIELD.SESSION_ID]) || undefined,
    supersededBy: getText(fields[FIELD.SUPERSEDED_BY]) || undefined,
    createdAt: typeof fields[FIELD.CREATED_AT] === 'number' ? (fields[FIELD.CREATED_AT] as number) : Date.now(),
    updatedAt: typeof fields[FIELD.UPDATED_AT] === 'number' ? (fields[FIELD.UPDATED_AT] as number) : undefined,
    recordId,
  };
}
