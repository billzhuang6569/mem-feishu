import type { PluginConfig } from "./config.js";
import { FeishuClient } from "./feishu-client.js";

const MEMORY_BASE_NAME = "OpenClaw-Memory-Base";

export interface SetupResult {
  appToken: string;
  tableId: string;
  tableName: string;
  createdBase: boolean;
  createdTable: boolean;
}

const MEMORY_FIELDS: Array<{ name: string; type: number }> = [
  { name: "memory_id", type: 1 },
  { name: "content", type: 1 },
  { name: "category", type: 3 },
  { name: "importance", type: 2 },
  { name: "tags", type: 4 },
  { name: "source", type: 3 },
  { name: "agent_id", type: 1 },
  { name: "vector_id", type: 1 },
  { name: "created_at", type: 5 },
  { name: "updated_at", type: 5 },
  { name: "expires_at", type: 5 }
];

export function extractAppToken(input: string): string | undefined {
  const matched = input.match(/\/base\/([a-zA-Z0-9]+)/);
  return matched?.[1];
}

export async function ensureMemorySetup(
  client: FeishuClient,
  config: PluginConfig,
  agentId: string
): Promise<SetupResult> {
  let appToken = config.feishu.appToken;
  let createdBase = false;

  if (appToken) {
    appToken = extractAppToken(appToken) ?? appToken;
  }

  if (!appToken) {
    const created = await client.createBitableApp(MEMORY_BASE_NAME);
    appToken = created.appToken;
    createdBase = true;
    if (config.feishu.adminEmail) {
      await client.addCollaboratorByEmail(appToken, config.feishu.adminEmail);
    }
  }

  const targetTableName = `Table-${agentId}`;
  const tables = await client.listTables(appToken);
  const existing = tables.find((table) => table.name === targetTableName);
  let tableId = existing?.tableId;
  let createdTable = false;

  if (!tableId) {
    const createdTableResult = await client.createTable(appToken, targetTableName);
    tableId = createdTableResult.tableId;
    createdTable = true;
  }

  await ensureTableFields(client, appToken, tableId);

  return {
    appToken,
    tableId,
    tableName: targetTableName,
    createdBase,
    createdTable
  };
}

async function ensureTableFields(client: FeishuClient, appToken: string, tableId: string): Promise<void> {
  const existingFields = await client.listFields(appToken, tableId);
  const existingNames = new Set(existingFields.map((field) => field.fieldName));

  for (const field of MEMORY_FIELDS) {
    if (!existingNames.has(field.name)) {
      await client.createField(appToken, tableId, field.name, field.type);
    }
  }
}
