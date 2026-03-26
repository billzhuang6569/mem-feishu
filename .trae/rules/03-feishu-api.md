---
description: Feishu Bitable API integration guidelines
globs: ["feishu-client.ts", "memory-service.ts", "setup.ts"]
alwaysApply: false
---

# Feishu Bitable API Guidelines

## Authentication
- Auth via `tenant_access_token` (auto-refresh before expiry).
- Do NOT use OAuth 2.0 `user_access_token`.

## Data Types & Formats
- Date fields MUST use millisecond timestamps.
- Single/Multi-select fields accept string values directly.
- Text fields are raw text, markdown is not supported.

## Error Handling
- Handle HTTP 429 (rate limit) with exponential backoff.
- Handle HTTP 403 (permission) with clear error messages.

## Collaborator Management
- When creating a new Base, use the `feishu_email` from config to add the user as a collaborator with `full_access` via the permission-member API.

## Token Extraction
- The setup logic must support extracting the `app_token` from a full Feishu Bitable URL using regex (e.g., extracting `bascnXXXXX` from `https://xxx.feishu.cn/base/bascnXXXXX`).
