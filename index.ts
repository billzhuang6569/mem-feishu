import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { OpenClawConfigSchema } from "./config.js";
import { Type } from "@sinclair/typebox";
import { FeishuClient } from "./feishu-client.js";
import { MemoryService } from "./memory-service.js";
import type { PluginConfig } from "./config.js";
import { ensureMemorySetup } from "./setup.js";

export default definePluginEntry({
  id: "mem-feishu-v2",
  name: "mem-feishu-v2",
  description: "Feishu Bitable memory plugin for OpenClaw",
  kind: "memory",
  configSchema: OpenClawConfigSchema,
  register(api) {
    api.logger.info("mem-feishu-v2 initialized");

    const config = api.pluginConfig as PluginConfig;
    const client = new FeishuClient({
      appId: config.feishu.appId,
      appSecret: config.feishu.appSecret
    });
    const service = new MemoryService(client, config);

    api.registerTool((ctx) => ({
      name: "mem_feishu_setup",
      label: "Mem Setup",
      description: "Setup memory base and table for current agent",
      parameters: Type.Object({
        appTokenOrUrl: Type.Optional(Type.String({ minLength: 1 }))
      }),
      async execute(_toolCallId, params, _signal) {
        const agentId = ctx.agentId ?? "default";
        const setupConfig: PluginConfig =
          params.appTokenOrUrl && params.appTokenOrUrl.trim().length > 0
            ? {
                ...config,
                feishu: {
                  ...config.feishu,
                  appToken: params.appTokenOrUrl.trim()
                }
              }
            : config;
        try {
          const result = await ensureMemorySetup(client, setupConfig, agentId);
          return {
            content: [
              {
                type: "text",
                text: `Setup success. appToken=${result.appToken}, tableId=${result.tableId}, tableName=${result.tableName}`
              }
            ],
            details: {
              success: true,
              ...result
            }
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text",
                text: `Setup failed: ${message}`
              }
            ],
            details: {
              success: false,
              error: message
            }
          };
        }
      }
    }));

    api.registerTool((ctx) => ({
      name: "memory_store",
      label: "Mem Store",
      description: "Store a memory in Feishu Bitable",
      parameters: Type.Object({
        content: Type.String({ minLength: 1 }),
        category: Type.Optional(
          Type.Union([
            Type.Literal("preference"),
            Type.Literal("fact"),
            Type.Literal("decision"),
            Type.Literal("entity"),
            Type.Literal("other")
          ])
        ),
        importance: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
        tags: Type.Optional(Type.Array(Type.String())),
        source: Type.Optional(
          Type.Union([
            Type.Literal("auto-capture"),
            Type.Literal("manual"),
            Type.Literal("tool-call")
          ])
        ),
        expiresAt: Type.Optional(Type.Number())
      }),
      async execute(_toolCallId, params, _signal) {
        const memory = await service.store(ctx.agentId ?? "default", params);
        return {
          content: [
            {
              type: "text",
              text: `Stored memory ${memory.memoryId}`
            }
          ],
          details: memory
        };
      }
    }));

    api.registerTool((ctx) => ({
      name: "memory_recall",
      label: "Mem Recall",
      description: "Recall related memories from Feishu Bitable",
      parameters: Type.Object({
        query: Type.String({ minLength: 1 }),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
        minScore: Type.Optional(Type.Number({ minimum: 0, maximum: 1 }))
      }),
      async execute(_toolCallId, params, _signal) {
        const memories = await service.recall(ctx.agentId ?? "default", {
          ...params,
          limit: params.limit ?? config.recallLimit ?? 5,
          minScore: params.minScore ?? config.recallMinScore ?? 0.3
        });
        return {
          content: [
            {
              type: "text",
              text: memories.length === 0 ? "No memories found." : memories.map((m) => `- ${m.content}`).join("\n")
            }
          ],
          details: {
            count: memories.length,
            memories
          }
        };
      }
    }));

    api.registerTool((ctx) => ({
      name: "memory_forget",
      label: "Mem Forget",
      description: "Delete a memory record from Feishu Bitable by record_id",
      parameters: Type.Object({
        recordId: Type.String({ minLength: 1 })
      }),
      async execute(_toolCallId, params, _signal) {
        await service.forget(ctx.agentId ?? "default", params.recordId);
        return {
          content: [
            {
              type: "text",
              text: `Deleted record ${params.recordId}`
            }
          ],
          details: {
            recordId: params.recordId
          }
        };
      }
    }));
  }
});
