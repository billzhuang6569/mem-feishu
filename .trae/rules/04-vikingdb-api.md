---
description: Volcengine VikingDB API integration guidelines
globs: ["vikingdb-client.ts", "memory-service.ts"]
alwaysApply: false
---

# Volcengine VikingDB Guidelines

## Architecture
- All vector operations are cloud-side; no local embedding.
- Do NOT use local vector databases like LanceDB.

## Embedding Model
- Use built-in `bge-large-zh` model.
- The output dimension MUST be exactly 1024.
- Hardcode the model name and dimension, do not rely on defaults.

## Authentication
- HMAC-SHA256 signing MUST be handled internally in a dedicated client module.
- The signature must be included in the `Authorization` header of every HTTP request.
