import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { OpenClawPluginConfigSchema } from "openclaw/plugin-sdk/plugin-entry";

const FeishuConfigSchema = Type.Object(
  {
    appId: Type.String({ minLength: 1 }),
    appSecret: Type.String({ minLength: 1 }),
    appToken: Type.Optional(Type.String({ minLength: 1 })),
    adminEmail: Type.Optional(Type.String({ minLength: 3 }))
  },
  { additionalProperties: false }
);

const VikingDBConfigSchema = Type.Object(
  {
    enabled: Type.Boolean({ default: false }),
    accessKeyId: Type.Optional(Type.String({ minLength: 1 })),
    accessKeySecret: Type.Optional(Type.String({ minLength: 1 })),
    host: Type.Optional(Type.String({ minLength: 1 })),
    collectionName: Type.Optional(Type.String({ minLength: 1 })),
    indexName: Type.Optional(Type.String({ minLength: 1 })),
    embeddingModel: Type.Optional(Type.String({ minLength: 1 }))
  },
  { additionalProperties: false }
);

export const PluginConfigSchema = Type.Object(
  {
    feishu: FeishuConfigSchema,
    vikingdb: Type.Optional(VikingDBConfigSchema),
    autoCapture: Type.Optional(Type.Boolean({ default: true })),
    autoRecall: Type.Optional(Type.Boolean({ default: true })),
    recallLimit: Type.Optional(Type.Integer({ minimum: 1, default: 5 })),
    recallMinScore: Type.Optional(Type.Number({ minimum: 0, maximum: 1, default: 0.3 }))
  },
  { additionalProperties: false }
);

export type PluginConfig = Static<typeof PluginConfigSchema>;

export const PluginConfigJsonSchema = PluginConfigSchema as unknown as Record<string, unknown>;

const DEFAULT_CONFIG: Omit<PluginConfig, "feishu"> = {
  vikingdb: {
    enabled: false
  },
  autoCapture: true,
  autoRecall: true,
  recallLimit: 5,
  recallMinScore: 0.3
};

export function parsePluginConfig(input: unknown): PluginConfig {
  const merged = {
    ...DEFAULT_CONFIG,
    ...(typeof input === "object" && input !== null ? input : {})
  };

  if (!Value.Check(PluginConfigSchema, merged)) {
    const messages = [...Value.Errors(PluginConfigSchema, merged)].map(
      (error) => `${error.path || "/"} ${error.message}`
    );
    throw new Error(`Invalid mem-feishu-v2 config: ${messages.join("; ")}`);
  }

  if (merged.vikingdb?.enabled) {
    const requiredVikingFields: Array<keyof NonNullable<PluginConfig["vikingdb"]>> = [
      "accessKeyId",
      "accessKeySecret",
      "host",
      "collectionName",
      "indexName",
      "embeddingModel"
    ];
    const missingFields = requiredVikingFields.filter((field) => {
      const value = merged.vikingdb?.[field];
      return typeof value !== "string" || value.trim().length === 0;
    });
    if (missingFields.length > 0) {
      throw new Error(
        `Invalid mem-feishu-v2 config: missing vikingdb fields when enabled: ${missingFields.join(", ")}`
      );
    }
  }

  return merged;
}

export const OpenClawConfigSchema: OpenClawPluginConfigSchema = {
  parse: parsePluginConfig,
  jsonSchema: PluginConfigJsonSchema
};
