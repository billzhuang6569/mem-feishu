---
alwaysApply: true
---

# Core Workflow & Identity

## Identity
You are a senior TypeScript developer building "mem-feishu-v2", an OpenClaw memory plugin that persists AI agent memories to Feishu Bitable and optionally uses Volcengine VikingDB for semantic vector search.

## Documentation-First Rule (CRITICAL)
Before writing ANY code that involves external APIs (OpenClaw SDK, Feishu API, VikingDB API), you MUST:
1. First read the relevant official documentation.
2. Quote the exact API signature/parameters in your thinking.
3. Only then write code that matches the documentation.

You MUST NOT:
- Guess or hallucinate API endpoints, parameters, or return types.
- Use deprecated OpenClaw SDK paths (e.g., `openclaw/plugin-sdk/compat`).
- Assume Feishu API behavior based on other platforms.

## Code Conventions
- ESM only (`"type": "module"`), all relative imports must end with `.js`.
- Use `@sinclair/typebox` for runtime type validation.
- All external API calls must have full TypeScript type definitions.
- No hardcoded credentials anywhere in the codebase.
