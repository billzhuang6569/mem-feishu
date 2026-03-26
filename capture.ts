import type { MemoryStoreInput } from "./types.js";

export interface CaptureInput {
  messages: unknown[];
  maxMemories?: number;
}

const MAX_MEMORY_CONTENT_LENGTH = 300;

const REMEMBER_PATTERN =
  /(请记住|帮我记住|记住这件事|记一下|务必记住|remember this|remember that|please remember)/i;
const PREFERENCE_PATTERN =
  /(我喜欢|我不喜欢|我偏好|我习惯|我通常|我更倾向|I like|I prefer|I don't like|my favorite)/i;
const DECISION_PATTERN =
  /(我决定|之后都|以后都|统一使用|默认使用|约定|从现在开始|we will|let's|going forward)/i;
const FACT_PATTERN =
  /(我是|我叫|我的邮箱|我的电话|我的手机号|我在.*工作|我住在|I am|my email|my phone|I work|I live)/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+?86[-\s]?)?1[3-9]\d{9}|\+?\d[\d\s-]{7,}\d/g;

export function captureMemoriesByRules(input: CaptureInput): MemoryStoreInput[] {
  const maxMemories = input.maxMemories ?? 5;
  const userTexts = input.messages
    .map(extractUserMessageText)
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0);

  const dedup = new Set<string>();
  const captured: MemoryStoreInput[] = [];

  for (const text of userTexts) {
    const segments = splitIntoSegments(text);
    for (const segment of segments) {
      const memory = classifySegment(segment);
      if (!memory) {
        continue;
      }
      const key = memory.content.trim().toLowerCase();
      if (dedup.has(key)) {
        continue;
      }
      dedup.add(key);
      captured.push(memory);
      if (captured.length >= maxMemories) {
        return captured;
      }
    }
  }

  return captured;
}

function extractUserMessageText(message: unknown): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const candidate = message as { role?: unknown; content?: unknown; type?: unknown };
  if (typeof candidate.role === "string" && candidate.role !== "user") {
    return undefined;
  }
  if (candidate.type === "toolCall" || candidate.type === "toolResult") {
    return undefined;
  }
  if (typeof candidate.content === "string") {
    return candidate.content;
  }
  if (Array.isArray(candidate.content)) {
    return candidate.content
      .map((part) => {
        if (!part || typeof part !== "object") {
          return "";
        }
        const typed = part as { type?: unknown; text?: unknown; content?: unknown };
        if (typed.type === "text" && typeof typed.text === "string") {
          return typed.text;
        }
        if (typeof typed.content === "string") {
          return typed.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return undefined;
}

function splitIntoSegments(text: string): string[] {
  return text
    .split(/[\n。！？!?；;]+/g)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 6);
}

function classifySegment(segment: string): MemoryStoreInput | undefined {
  const normalized = normalizeMemoryContent(segment);
  if (!normalized) {
    return undefined;
  }

  const tags: string[] = [];
  let category: MemoryStoreInput["category"] = "other";
  let importance = 0.55;

  const hasRemember = REMEMBER_PATTERN.test(segment);
  const hasPreference = PREFERENCE_PATTERN.test(segment);
  const hasDecision = DECISION_PATTERN.test(segment);
  const hasFact = FACT_PATTERN.test(segment);
  const emails = extractPatternMatches(segment, EMAIL_PATTERN);
  const phones = extractPatternMatches(segment, PHONE_PATTERN);

  if (emails.length > 0) {
    tags.push("email");
    category = "fact";
    importance = 0.92;
  }
  if (phones.length > 0) {
    tags.push("phone");
    category = "fact";
    importance = Math.max(importance, 0.9);
  }
  if (hasPreference) {
    tags.push("preference");
    category = "preference";
    importance = Math.max(importance, 0.82);
  }
  if (hasDecision) {
    tags.push("decision");
    category = "decision";
    importance = Math.max(importance, 0.86);
  }
  if (hasFact && category === "other") {
    tags.push("fact");
    category = "fact";
    importance = Math.max(importance, 0.75);
  }
  if (hasRemember) {
    tags.push("explicit-memory");
    importance = Math.max(importance, 0.88);
  }

  if (
    !hasRemember &&
    !hasPreference &&
    !hasDecision &&
    !hasFact &&
    emails.length === 0 &&
    phones.length === 0
  ) {
    return undefined;
  }

  return {
    content: normalized,
    category,
    importance: Number(importance.toFixed(2)),
    tags: unique(tags),
    source: "auto-capture"
  };
}

function normalizeMemoryContent(content: string): string | undefined {
  const cleaned = content
    .replace(/\s+/g, " ")
    .replace(/^(请|帮我|麻烦)?记住(一下|这件事)?[:：]?\s*/i, "")
    .trim();
  if (!cleaned || cleaned.length < 4) {
    return undefined;
  }
  if (cleaned.length <= MAX_MEMORY_CONTENT_LENGTH) {
    return cleaned;
  }
  return cleaned.slice(0, MAX_MEMORY_CONTENT_LENGTH);
}

function extractPatternMatches(text: string, pattern: RegExp): string[] {
  const matched = text.match(pattern);
  return matched ? unique(matched.map((item) => item.trim())) : [];
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}
