import { getClient, getAppToken, tryGetAppToken, writeLocalConfig } from './client.js';
import { Memory, MemoryState, MemoryInput, FIELD, TABLE_NAME } from './types.js';
import { v4 as uuidv4 } from 'uuid';

// 飞书字段类型枚举（Bitable API）
const FieldType = {
  TEXT: 1,        // 文本
  NUMBER: 2,      // 数字
  SELECT: 3,      // 单选
  MULTISELECT: 4, // 多选
  DATE: 5,        // 日期
  CHECKBOX: 7,    // 复选框
};

// 自动创建飞书多维表格 Base，返回 App Token
// 需要应用具备 bitable:app 权限
export async function createBase(name: string): Promise<string> {
  const client = getClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.bitable as any).app.create({
    data: { name, folder_token: '' },  // folder_token 为空则创建在根目录
  });
  const appToken = res?.data?.app?.app_token;
  if (!appToken) throw new Error('创建飞书多维表格 Base 失败，请检查应用权限（bitable:app）');
  // 保存到本地，后续不需要重复配置
  const url = `https://feishu.cn/base/${appToken}`;
  writeLocalConfig({ appToken, baseUrl: url, createdAt: Date.now() });
  return appToken;
}

// 确保多维表格和字段存在，返回 table_id
export async function ensureTable(): Promise<string> {
  const client = getClient();
  const appToken = getAppToken();

  // 列出所有表格，查找目标表格
  const listRes = await client.bitable.appTable.list({ path: { app_token: appToken } });
  const tables = listRes.data?.items ?? [];
  const existing = tables.find((t) => t.name === TABLE_NAME);
  if (existing?.table_id) {
    return existing.table_id;
  }

  // 创建表格（需先创建再添加字段）
  const createRes = await client.bitable.appTable.create({
    path: { app_token: appToken },
    data: { table: { name: TABLE_NAME } },
  });
  const tableId = createRes.data?.table_id;
  if (!tableId) throw new Error('创建多维表格失败');

  // 飞书新建表格会自动创建一个「文本」默认字段。
  // 我们需要：记忆ID（文本，第一字段）、内容（文本）、标签（多选）、来源（单选）、状态（单选）、项目（文本）、创建时间（日期）
  // 先获取默认字段，将其重命名为「记忆ID」
  const fieldsRes = await client.bitable.appTableField.list({
    path: { app_token: appToken, table_id: tableId },
  });
  const defaultField = fieldsRes.data?.items?.[0];
  if (defaultField?.field_id) {
    await client.bitable.appTableField.update({
      path: { app_token: appToken, table_id: tableId, field_id: defaultField.field_id },
      data: { field_name: FIELD.ID, type: FieldType.TEXT },
    });
  }

  // 依次创建剩余字段
  const fieldsToCreate = [
    { field_name: FIELD.CONTENT, type: FieldType.TEXT },
    { field_name: FIELD.TAGS, type: FieldType.MULTISELECT },
    { field_name: FIELD.SOURCE, type: FieldType.SELECT },
    { field_name: FIELD.STATE, type: FieldType.SELECT },
    { field_name: FIELD.PROJECT, type: FieldType.TEXT },
    { field_name: FIELD.CREATED_AT, type: FieldType.DATE },
  ];

  for (const field of fieldsToCreate) {
    await client.bitable.appTableField.create({
      path: { app_token: appToken, table_id: tableId },
      data: field,
    });
  }

  return tableId;
}

// 新增一条记忆记录，返回 Memory（含飞书 record_id）
export async function addRecord(tableId: string, input: MemoryInput): Promise<Memory> {
  const client = getClient();
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
    [FIELD.PROJECT]: input.project ?? '',
    [FIELD.CREATED_AT]: now,
  };

  const res = await client.bitable.appTableRecord.create({
    path: { app_token: appToken, table_id: tableId },
    data: { fields },
  });

  const recordId = res.data?.record?.record_id;

  return {
    id,
    content: input.content,
    tags: input.tags ?? [],
    source: input.source ?? 'manual',
    state: '活跃',
    project: input.project,
    createdAt: now,
    recordId,
  };
}

// 按飞书 record_id 列表批量获取完整记录
export async function getRecordsByIds(tableId: string, recordIds: string[]): Promise<Memory[]> {
  if (recordIds.length === 0) return [];
  const client = getClient();
  const appToken = getAppToken();
  const results: Memory[] = [];

  for (const recordId of recordIds) {
    try {
      const res = await client.bitable.appTableRecord.get({
        path: { app_token: appToken, table_id: tableId, record_id: recordId },
      });
      const f = res.data?.record?.fields;
      if (f) results.push(parseFields(f, recordId));
    } catch {
      // 记录可能已被删除，跳过
    }
  }
  return results;
}

// 获取最近 N 条活跃记忆（按创建时间倒序）
export async function listRecent(tableId: string, limit: number): Promise<Memory[]> {
  const client = getClient();
  const appToken = getAppToken();

  const res = await client.bitable.appTableRecord.list({
    path: { app_token: appToken, table_id: tableId },
    params: {
      page_size: Math.min(limit, 100),
      sort: JSON.stringify([{ field_name: FIELD.CREATED_AT, desc: true }]),
      filter: `CurrentValue.[${FIELD.STATE}]="活跃"`,
    },
  });

  return (res.data?.items ?? []).map((item) =>
    parseFields(item.fields ?? {}, item.record_id)
  );
}

// 更新记忆状态/标签
export async function updateRecord(
  tableId: string,
  recordId: string,
  patch: Partial<{ state: MemoryState; tags: string[] }>
): Promise<void> {
  const client = getClient();
  const appToken = getAppToken();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields: Record<string, any> = {};
  if (patch.state !== undefined) fields[FIELD.STATE] = patch.state;
  if (patch.tags !== undefined) fields[FIELD.TAGS] = patch.tags;

  await client.bitable.appTableRecord.update({
    path: { app_token: appToken, table_id: tableId, record_id: recordId },
    data: { fields },
  });
}

// 软删除
export async function deleteRecord(tableId: string, recordId: string): Promise<void> {
  await updateRecord(tableId, recordId, { state: '已删除' });
}

// 将多维表格所有权转移给指定用户
// memberType: 'openid' | 'userid' | 'email'
// 使用 tenant_access_token，调用飞书 Drive 权限转移 API
export async function transferOwner(
  memberType: 'openid' | 'userid' | 'email',
  memberId: string,
): Promise<void> {
  const client = getClient();
  const appToken = getAppToken();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client as any).request({
    method: 'POST',
    url: `https://open.feishu.cn/open-apis/drive/v1/permissions/${appToken}/members/transfer_owner`,
    params: {
      type: 'bitable',
      remove_old_owner: false,   // 保留应用本身的编辑权限，避免失去访问
      stay_put: true,            // 文档留在原位置
      old_owner_perm: 'full_access',
    },
    data: { member_type: memberType, member_id: memberId },
  });
}

// 获取多维表格的直接访问链接
// 飞书 Bitable 的 URL 格式：https://feishu.cn/base/{app_token}
// 注：实际链接会重定向到对应租户域名，但此格式通用可跳转
export function getBaseUrl(): string {
  const appToken = getAppToken();
  return `https://feishu.cn/base/${appToken}`;
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

  return {
    id,
    content,
    tags,
    source,
    state,
    project: project || undefined,
    createdAt: typeof fields[FIELD.CREATED_AT] === 'number' ? (fields[FIELD.CREATED_AT] as number) : Date.now(),
    recordId,
  };
}
