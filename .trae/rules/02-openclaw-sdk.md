---
description: OpenClaw Plugin SDK guidelines and best practices
globs: ["index.ts", "config.ts", "capture.ts", "sync.ts", "setup.ts"]
alwaysApply: false
---

# OpenClaw Plugin SDK Guidelines

## Import Paths
- Import from `openclaw/plugin-sdk/*` ONLY.
- Never use `openclaw/plugin-sdk/compat`.
- Use `definePluginEntry()` from `openclaw/plugin-sdk/plugin-entry`.

## Plugin Manifest (`openclaw.plugin.json`)
- Declare `"kind": "memory"` in both code and manifest.
- `configSchema` must set `"additionalProperties": false` to prevent invalid configs.
- Sensitive fields (like API Keys) must be marked with `"sensitive": true` in `uiHints`.

## Tool Registration
- Use `api.registerTool()` directly passing the tool object (not a factory function).
- Tool parameters schema must use `@sinclair/typebox` `Type.Object()`.
- Tool `execute()` must return `{ content: [{ type: "text", text }], details: {...} }`.

## Lifecycle Hooks & Services
- Use `api.on("before_agent_start", ...)` for auto-recall.
- Use `api.on("agent_end", ...)` for auto-capture.
- Use `api.registerService()` to start background tasks (e.g., `setInterval` for syncing).

## Reference Implementation
The official OpenClaw `memory-lancedb` plugin is the primary reference:
- Source: `extensions/memory-lancedb/` in the OpenClaw repo.
- It demonstrates: `definePluginEntry`, `registerTool`, `on("before_agent_start")`, `on("agent_end")`.
