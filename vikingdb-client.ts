import { createHash, createHmac } from "node:crypto";

export interface VikingDBAuthConfig {
  accessKeyId: string;
  accessKeySecret: string;
  host: string;
  region?: string;
  service?: string;
}

export interface VikingDBUpsertItem {
  id: string;
  recordId: string;
  agentId: string;
  content: string;
  vector: number[];
}

interface VikingDBEnvelope<T> {
  code: number;
  message?: string;
  msg?: string;
  request_id?: string;
  data?: T;
}

const JSON_CONTENT_TYPE = "application/json";
const SIGNED_HEADERS = "content-type;host;x-content-sha256;x-date";
const ALGORITHM = "HMAC-SHA256";
const VIKING_EMBEDDING_MODEL = "bge-large-zh";
export const VIKING_VECTOR_DIMENSION = 1024;

export class VikingDBClient {
  private readonly region: string;
  private readonly service: string;
  private readonly host: string;
  private readonly origin: string;

  constructor(private readonly auth: VikingDBAuthConfig) {
    this.region = auth.region ?? "cn-beijing";
    this.service = auth.service ?? "vikingdb";
    this.host = normalizeHost(auth.host);
    this.origin = `https://${this.host}`;
  }

  async embedding(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    const payload = {
      model: {
        model_name: VIKING_EMBEDDING_MODEL
      },
      data: texts.map((text) => ({
        data_type: "text",
        text
      }))
    };
    const data = await this.request<number[][]>("POST", "/api/data/embedding", payload);
    if (!Array.isArray(data)) {
      throw new Error("Invalid embedding response");
    }
    return data;
  }

  async upsertData(collectionName: string, items: VikingDBUpsertItem[]): Promise<void> {
    if (items.length === 0) {
      return;
    }
    await this.request(
      "POST",
      "/api/collection/upsert_data",
      {
        collection_name: collectionName,
        fields: items.map((item) => ({
          id: item.id,
          record_id: item.recordId,
          agent_id: item.agentId,
          content: item.content,
          vector: item.vector
        }))
      }
    );
  }

  async searchRecordIdsByVector(params: {
    collectionName: string;
    indexName: string;
    vector: number[];
    agentId: string;
    limit: number;
  }): Promise<string[]> {
    const response = await this.request<unknown>(
      "POST",
      "/api/vikingdb/data/search/vector",
      {
        collection_name: params.collectionName,
        index_name: params.indexName,
        limit: params.limit,
        dense_vector: params.vector,
        output_fields: ["record_id", "agent_id"],
        filter: `agent_id == "${params.agentId}"`
      }
    );
    return extractRecordIds(response, params.limit);
  }

  private async request<TData = Record<string, unknown>>(
    method: "POST" | "GET",
    path: string,
    body?: Record<string, unknown>
  ): Promise<TData> {
    const payload = body ? JSON.stringify(body) : "";
    const payloadHash = sha256Hex(payload);
    const xDate = formatXDate(new Date());
    const authorization = this.sign({
      method,
      path,
      payloadHash,
      xDate
    });

    const response = await fetch(`${this.origin}${path}`, {
      method,
      headers: {
        Host: this.host,
        "Content-Type": JSON_CONTENT_TYPE,
        "X-Date": xDate,
        "X-Content-Sha256": payloadHash,
        Authorization: authorization
      },
      body: payload || undefined
    });

    const json = (await response.json()) as VikingDBEnvelope<TData>;
    if (!response.ok || json.code !== 0) {
      throw new Error(
        `VikingDB API error: status=${response.status}, code=${json.code}, message=${json.message ?? json.msg ?? ""}`
      );
    }
    return (json.data ?? ({} as TData)) as TData;
  }

  private sign(input: { method: string; path: string; payloadHash: string; xDate: string }): string {
    const shortDate = input.xDate.slice(0, 8);
    const canonicalRequest = buildCanonicalRequest({
      method: input.method,
      path: input.path,
      host: this.host,
      payloadHash: input.payloadHash,
      xDate: input.xDate
    });
    const credentialScope = `${shortDate}/${this.region}/${this.service}/request`;
    const stringToSign = [
      ALGORITHM,
      input.xDate,
      credentialScope,
      sha256Hex(canonicalRequest)
    ].join("\n");

    const kDate = hmac(this.auth.accessKeySecret, shortDate);
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, this.service);
    const kSigning = hmac(kService, "request");
    const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

    return `${ALGORITHM} Credential=${this.auth.accessKeyId}/${credentialScope}, SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`;
  }
}

function extractRecordIds(raw: unknown, limit: number): string[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const candidates: unknown[] = [];
  const source = raw as {
    items?: unknown[];
    data?: unknown[];
    results?: unknown[];
    result_list?: unknown[];
    list?: unknown[];
    result?: {
      data?: unknown[];
      result_list?: unknown[];
    };
  };
  for (const list of [
    source.items,
    source.data,
    source.results,
    source.result_list,
    source.list,
    source.result?.data,
    source.result?.result_list
  ]) {
    if (Array.isArray(list)) {
      candidates.push(...list);
    }
  }
  const ids = candidates
    .map((item) => {
      if (!item || typeof item !== "object") {
        return undefined;
      }
      const entry = item as { record_id?: unknown; fields?: { record_id?: unknown } };
      if (typeof entry.record_id === "string") {
        return entry.record_id;
      }
      if (entry.fields && typeof entry.fields.record_id === "string") {
        return entry.fields.record_id;
      }
      return undefined;
    })
    .filter((id): id is string => typeof id === "string");
  return [...new Set(ids)].slice(0, limit);
}

function buildCanonicalRequest(input: {
  method: string;
  path: string;
  host: string;
  payloadHash: string;
  xDate: string;
}): string {
  const url = new URL(`https://${input.host}${input.path}`);
  const canonicalHeaders =
    `content-type:${JSON_CONTENT_TYPE}\n` +
    `host:${input.host}\n` +
    `x-content-sha256:${input.payloadHash}\n` +
    `x-date:${input.xDate}\n`;
  return [
    input.method.toUpperCase(),
    encodePath(url.pathname),
    canonicalQuery(url.searchParams),
    canonicalHeaders,
    SIGNED_HEADERS,
    input.payloadHash
  ].join("\n");
}

function canonicalQuery(searchParams: URLSearchParams): string {
  const entries = [...searchParams.entries()].map(([key, value]) => [percentEncode(key), percentEncode(value)] as const);
  entries.sort((a, b) => {
    if (a[0] === b[0]) {
      return a[1].localeCompare(b[1]);
    }
    return a[0].localeCompare(b[0]);
  });
  return entries.map(([key, value]) => `${key}=${value}`).join("&");
}

function encodePath(pathname: string): string {
  return pathname
    .split("/")
    .map((part) => percentEncode(part))
    .join("/")
    .replace(/%2F/g, "/");
}

function percentEncode(input: string): string {
  return encodeURIComponent(input).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function formatXDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

function normalizeHost(raw: string): string {
  return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}
