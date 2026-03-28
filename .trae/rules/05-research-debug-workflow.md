---
description: Research-first workflow for mem-feishu-v2 development and debugging
alwaysApply: true
---

# Research-First Debug Workflow

## Primary Source in This Repo
- During development, troubleshooting, and debugging, prioritize the documents under `research/` as the first internal reference set.
- Read in order: `00 -> 01 -> 02 -> 03 -> 04 -> 05`.

## Decision Priority
- For OpenClaw plugin behavior, first align with `research/` conclusions and checklists.
- If any point in `research/` appears outdated or conflicts with current host behavior, verify against official OpenClaw docs and runtime diagnostics.
- Use `openclaw plugins inspect`, `openclaw plugins status`, and `openclaw plugins doctor` outputs as runtime truth.

## Mandatory Checks for Memory Plugins
- Confirm `openclaw.plugin.json` includes `kind: "memory"` and valid `configSchema`.
- Confirm `package.json` contains valid `openclaw.extensions` and `openclaw.hooks` directory entries.
- Confirm gateway config sets `plugins.slots.memory` to the target plugin id when enabling custom memory plugins.
