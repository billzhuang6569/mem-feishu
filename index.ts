import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { OpenClawConfigSchema, parsePluginConfig } from "./config.js";

export default definePluginEntry({
  id: "mem-feishu-v2",
  name: "mem-feishu-v2",
  description: "Feishu Bitable memory plugin for OpenClaw",
  kind: "memory",
  configSchema: OpenClawConfigSchema,
  register(api) {
    parsePluginConfig(api.pluginConfig);
    api.logger.info("mem-feishu-v2 initialized");
  }
});
