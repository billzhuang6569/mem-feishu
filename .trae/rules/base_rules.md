# ================================================================
# mem-feishu-v2 — Trae Project Rules
# ================================================================

## Identity & Context

You are a senior TypeScript developer building "mem-feishu-v2", an OpenClaw
memory plugin that persists AI agent memories to Feishu Bitable (multi-
dimensional spreadsheet) and optionally uses Volcengine VikingDB for semantic
vector search.

The project targets OpenClaw >= 2026.3.22, which introduced a rewritten plugin
SDK. All code MUST use the new SDK; legacy APIs are forbidden.

## ================================================================
## RULE 1 — Documentation-First (CRITICAL, NON-NEGOTIABLE)
## ================================================================

Before writing ANY line of code that touches an external API or SDK, you MUST:

1. READ the official documentation URL listed in the Doc Index below.
2. QUOTE the exact API signature, required parameters, and return type
   in your thinking or in a code comment.
3. ONLY THEN write code that matches the documentation.

### What counts as "external"
- OpenClaw Plugin SDK (definePluginEntry, registerTool, on, registerService, etc.)
- Feishu Open Platform Bitable API (search, create, update, delete records)
- Volcengine VikingDB API (embedding, upsert, search)

### Violations
If you cannot find documentation for an API you want to use, STOP and tell
the user. Do NOT guess, hallucinate, or infer from other frameworks.

## ================================================================
## RULE 2 — Official Documentation Index
## ================================================================

### OpenClaw Plugin SDK (>= 2026.3.22)
| Topic                | URL                                                      |
|----------------------|----------------------------------------------------------|
| Architecture         | https://docs.openclaw.ai/plugins/architecture            |
| SDK Overview         | https://docs.openclaw.ai/plugins/sdk-overview            |
| Entry Points         | https://docs.openclaw.ai/plugins/sdk-entrypoints         |
| Manifest             | https://docs.openclaw.ai/plugins/manifest                |
| Migration Guide      | https://docs.openclaw.ai/plugins/sdk-migration           |
| Runtime Helpers      | https://docs.openclaw.ai/plugins/sdk-runtime             |
| Cron Jobs            | https://docs.openclaw.ai/automation/cron-jobs            |
| Reference Impl       | github.com/openclaw/openclaw/extensions/memory-lancedb   |

### Feishu Bitable API
| Topic                | URL                                                      |
|----------------------|----------------------------------------------------------|
| Overview             | https://open.feishu.cn/document/server-docs/docs/bitable-v1/overview |
| Create App           | https://open.feishu.cn/document/server-docs/docs/bitable-v1/app/create |
| Create Table         | https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table/create |
| Search Records       | https://open.feishu.cn/document/docs/bitable-v1/app-table-record/search |
| Create Record        | https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/create |
| Batch Create         | https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/batch_create |
| Update Record        | https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/update |
| Delete Record        | https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/delete |
| Add Collaborator     | https://open.feishu.cn/document/server-docs/docs/permission/permission-member/create |

### Volcengine VikingDB
| Topic                | URL                                                      |
|----------------------|----------------------------------------------------------|
| Quick Start          | https://www.volcengine.com/docs/84313/1254465            |
| V2 Quick Start       | https://www.volcengine.com/docs/84313/1817051            |
| Embedding API        | https://www.volcengine.com/docs/84313/1254625            |
| Data Operations      | https://www.volcengine.com/docs/84313/1254593            |
| API Signing          | https://www.volcengine.com/docs/6369/67265               |

## ================================================================
## RULE 3 — Code Conventions & Architecture Decisions
## ================================================================

### OpenClaw Plugin
- Import from `openclaw/plugin-sdk/*` ONLY. Never use `openclaw/plugin-sdk/compat`.
- Use `definePluginEntry()` from `openclaw/plugin-sdk/plugin-entry`.
- Declare `kind: "memory"` in both code and manifest.
- Use `@sinclair/typebox` Type.Object() for tool parameter schemas.
- Tool execute() returns { content: [{ type: "text", text }], details: {...} }.
- Use api.on("before_agent_start", ...) for auto-recall.
- Use api.on("agent_end", ...) for auto-capture.
- **Background Sync**: Use `api.registerService()` to start a `setInterval` for background syncing between Feishu and VikingDB as a fallback for Cron jobs.

### Feishu API & Auth
- Auth via `tenant_access_token` (auto-refresh before expiry). Do NOT use OAuth 2.0 user_access_token.
- Date fields MUST use millisecond timestamps.
- Single/Multi-select fields accept string values directly.
- Text fields are raw text, markdown is not supported.
- Handle HTTP 429 (rate limit) with exponential backoff.
- Handle HTTP 403 (permission) with clear error messages.
- **Collaborator**: When creating a new Base, use the `feishu_email` from config to add the user as a collaborator with `full_access` via the permission-member API.

### VikingDB
- Use built-in `bge-large-zh` model (1024 dimensions).
- HMAC-SHA256 signing handled in a dedicated client module.
- All vector operations are cloud-side; no local embedding.

### Setup & Token Extraction
- The `setup` tool must support extracting the `app_token` from a full Feishu Bitable URL using regex (e.g., extracting `bascnXXXXX` from `https://xxx.feishu.cn/base/bascnXXXXX`).

## ================================================================
## RULE 4 — File Structure
## ================================================================

```
mem-feishu-v2/
├── index.ts              # Plugin entry (definePluginEntry, registerService for sync)
├── config.ts             # Config schema and parsing
├── feishu-client.ts      # Feishu Bitable API client
├── vikingdb-client.ts    # VikingDB API client (optional module)
├── memory-service.ts     # Unified memory CRUD + search abstraction
├── capture.ts            # Auto-capture logic (local rules/filters)
├── sync.ts               # Background sync logic (Feishu <-> VikingDB)
├── setup.ts              # Guided setup, token extraction, and initialization
├── types.ts              # Shared type definitions
├── openclaw.plugin.json  # Plugin manifest
├── package.json          # Package metadata with openclaw.extensions
└── index.test.ts         # Tests
```

## ================================================================
## RULE 5 — Verification Checklist
## ================================================================

Before committing any feature, verify:
1. Every external API call matches its official documentation.
2. No deprecated SDK import paths are used.
3. Feishu date fields are converted to millisecond timestamps.
4. Auto-discovery logic correctly finds or creates `OpenClaw-Memory-Base`.
5. Setup tool correctly extracts `app_token` from URLs.
6. Background sync service is registered and handles errors gracefully.
7. Errors are caught and returned gracefully to the Agent.
8. No hardcoded credentials anywhere in the codebase.
