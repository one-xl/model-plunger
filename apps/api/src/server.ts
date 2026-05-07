import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { PrismaClient, type Prisma } from "@prisma/client";
import { load } from "cheerio";
import TurndownService from "turndown";
import axios from "axios";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import net from "node:net";
import zlib from "node:zlib";
import { z } from "zod";
import { createTwoFilesPatch } from "diff";
import { normalizeAnalysisStructure, repairParseAiJsonContent } from "./analysis-repair.js";
import {
  INTEGRATION_PROFILES,
  INTEGRATION_TARGETS,
  buildIntegrationRender,
  getOpenAiCompatibleChatPayload
} from "./integrations.js";

const prisma = new PrismaClient();
const app = Fastify({
  logger:
    process.env.VITEST === "true"
      ? false
      : {
          level: "info",
          transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined
        }
});

const MAX_DOC_SIZE = 5 * 1024 * 1024;
const MAX_ANALYZE_CHARS = 30_000;
const MAX_ROBOTS_TXT_BYTES = 256 * 1024;
const MAX_SITEMAP_XML_BYTES = 2 * 1024 * 1024;
const MAX_SITEMAP_FILES_PARSED = 25;
/** 单行文档参与 diff 的最大字符数（避免超大合并正文拖垮内存）。 */
const MAX_MARKDOWN_SIDE_CHARS_FOR_DIFF = 250_000;
const MAX_UNIFIED_DIFF_CHARS = 120_000;

const analyzerPrompt = `你是一个“AI 编程软件模型接入参数翻译器”。
你的任务不是简单总结大模型 API 文档，而是把文档中的技术接入信息翻译成小白能直接填写到 Cursor、Trae、Cline、Continue、Kilo Code、Codex CLI、Chatbox、Cherry Studio 等 AI 编程软件或 AI 客户端里的配置项。
你必须严格输出 JSON，不要输出 Markdown，不要输出解释文字。
如果信息没有在文档中明确出现，请填 null，并把字段名放入 unknownFields。
不要编造文档中不存在的信息。
如果无法确定，请标记为 unknown。
如果你是基于 OpenAI Compatible 通用规则推断出来的，请在 notes 或 warnings 中注明“根据 OpenAI Compatible 通用规则推断”。
如果文档中有 curl、Python、JavaScript 示例，优先从示例代码中提取接口、鉴权和请求体。

你需要识别：
- 平台名称
- 官方网站
- 文档 URL
- 是否兼容 OpenAI API
- Base URL
- Chat Completions 接口
- Embeddings 接口
- Models List 接口
- 鉴权方式
- Authorization Header
- API Key 环境变量名
- 模型名称
- 最小可用 Chat 请求
- curl 示例
- Python 示例
- JavaScript 示例
- 常见错误
- 限制或注意事项

同时你必须额外输出：
- 用户在 Cursor 里应该怎么填
- 用户在 Trae 里应该怎么填
- 用户在 Cline 里应该怎么填
- 用户在 Continue 里应该怎么填
- 用户在 Kilo Code 里应该怎么填
- 用户在 Codex CLI 里应该怎么填
- 用户在 Chatbox / Cherry Studio 里应该怎么填

重点解释：
1. Base URL 是什么。
2. Endpoint 是什么。
3. 完整接口 URL = Base URL + Endpoint。
4. 对 OpenAI Compatible 平台，大多数 AI 编程软件通常只需要填写 Base URL，不需要手动填写 /chat/completions。
5. 如果 Base URL 已经包含 /v1，不要重复添加 /v1。
6. 如果软件会自动拼接 /chat/completions，用户不要手动加。
7. 如果软件要求完整 endpoint，才需要填写完整 Chat URL。
8. 如果报 404，优先检查 /v1 和 /chat/completions 是否重复或缺失。
9. 如果报 401 / 403，优先检查 API Key。
10. 如果报 model not found，优先检查模型名是否和文档一致。

严格输出以下 JSON：
{
  "provider": { "name": null, "officialWebsite": null, "docsUrl": null, "description": null },
  "compatibility": { "isOpenAICompatible": null, "compatibleLevel": "full | partial | no | unknown", "evidence": null, "notes": null },
  "auth": { "type": "bearer | x-api-key | query-key | basic | custom | unknown", "headerName": null, "headerValueTemplate": null, "envNames": [], "notes": null },
  "endpoints": { "baseUrl": null, "chatCompletions": null, "embeddings": null, "models": null },
  "models": [{ "name": null, "type": "chat | reasoning | embedding | vision | image | audio | rerank | unknown", "contextWindow": null, "maxOutputTokens": null, "supportsStreaming": null, "supportsVision": null, "supportsTools": null, "supportsJsonMode": null, "notes": null }],
  "minimalRequests": { "chat": { "method": null, "url": null, "headers": {}, "body": {} }, "modelsList": { "method": null, "url": null, "headers": {} } },
  "codeExamples": { "curl": null, "python": null, "javascript": null },
  "commonErrors": [{ "error": null, "reason": null, "solution": null }],
  "limits": { "rateLimit": null, "quota": null, "notes": null },
  "clientConfigGuide": {
    "providerTypeToChoose": "OpenAI Compatible | OpenAI | Anthropic | Gemini | Ollama | Custom | Unknown",
    "baseUrlToFill": null,
    "apiKeyFieldInstruction": null,
    "modelNameInstruction": null,
    "chatEndpointFullUrl": null,
    "modelsEndpointFullUrl": null,
    "shouldUserIncludeV1": null,
    "shouldUserIncludeChatCompletions": null,
    "shouldUserIncludeFullEndpoint": null,
    "baseUrlExplanation": null,
    "endpointExplanation": null,
    "beginnerSummary": null,
    "commonMistakes": [],
    "copyableConfig": { "provider": null, "baseUrl": null, "apiKey": "YOUR_API_KEY", "model": null },
    "clientSpecificGuides": {
      "cursor": { "provider": null, "baseUrl": null, "apiKey": "YOUR_API_KEY", "model": null, "notes": [] },
      "trae": { "provider": null, "baseUrl": null, "apiKey": "YOUR_API_KEY", "model": null, "notes": [] },
      "cline": { "provider": null, "baseUrl": null, "apiKey": "YOUR_API_KEY", "model": null, "notes": [] },
      "continue": { "provider": null, "baseUrl": null, "apiKey": "YOUR_API_KEY", "model": null, "notes": [] },
      "kiloCode": { "provider": null, "baseUrl": null, "apiKey": "YOUR_API_KEY", "model": null, "notes": [] },
      "codexCli": { "provider": null, "baseUrl": null, "apiKey": "YOUR_API_KEY", "model": null, "notes": [] },
      "chatbox": { "provider": null, "baseUrl": null, "apiKey": "YOUR_API_KEY", "model": null, "notes": [] },
      "cherryStudio": { "provider": null, "baseUrl": null, "apiKey": "YOUR_API_KEY", "model": null, "notes": [] }
    }
  },
  "analysisMeta": { "confidence": 0, "unknownFields": [], "warnings": [], "sourceUrls": [] }
}`;

const stringOrNull = z.string().nullable();
const providerTypeSchema = z.enum(["OpenAI Compatible", "OpenAI", "Anthropic", "Gemini", "Ollama", "Custom", "Unknown"]);
const clientGuideItemSchema = z.object({
  provider: stringOrNull,
  baseUrl: stringOrNull,
  apiKey: z.string().nullable().default("YOUR_API_KEY"),
  model: stringOrNull,
  notes: z.array(z.string()).default([])
});
const clientConfigGuideSchema = z.object({
  providerTypeToChoose: providerTypeSchema.default("Unknown"),
  baseUrlToFill: stringOrNull,
  apiKeyFieldInstruction: stringOrNull,
  modelNameInstruction: stringOrNull,
  chatEndpointFullUrl: stringOrNull,
  modelsEndpointFullUrl: stringOrNull,
  shouldUserIncludeV1: z.boolean().nullable(),
  shouldUserIncludeChatCompletions: z.boolean().nullable(),
  shouldUserIncludeFullEndpoint: z.boolean().nullable(),
  baseUrlExplanation: stringOrNull,
  endpointExplanation: stringOrNull,
  beginnerSummary: stringOrNull,
  commonMistakes: z.array(z.string()).default([]),
  copyableConfig: z.object({
    provider: stringOrNull,
    baseUrl: stringOrNull,
    apiKey: z.string().nullable().default("YOUR_API_KEY"),
    model: stringOrNull
  }),
  clientSpecificGuides: z.object({
    cursor: clientGuideItemSchema,
    trae: clientGuideItemSchema,
    cline: clientGuideItemSchema,
    continue: clientGuideItemSchema,
    kiloCode: clientGuideItemSchema,
    codexCli: clientGuideItemSchema,
    chatbox: clientGuideItemSchema,
    cherryStudio: clientGuideItemSchema
  })
});
const analysisSchema = z.object({
  provider: z.object({
    name: stringOrNull,
    officialWebsite: stringOrNull,
    docsUrl: stringOrNull,
    description: stringOrNull
  }),
  compatibility: z.object({
    isOpenAICompatible: z.boolean().nullable(),
    compatibleLevel: z.enum(["full", "partial", "no", "unknown"]).default("unknown"),
    evidence: stringOrNull,
    notes: stringOrNull
  }),
  auth: z.object({
    type: z.enum(["bearer", "x-api-key", "query-key", "basic", "custom", "unknown"]).default("unknown"),
    headerName: stringOrNull,
    headerValueTemplate: stringOrNull,
    envNames: z.array(z.string()).default([]),
    notes: stringOrNull
  }),
  endpoints: z.object({
    baseUrl: stringOrNull,
    chatCompletions: stringOrNull,
    embeddings: stringOrNull,
    models: stringOrNull
  }),
  models: z.array(
    z.object({
      name: stringOrNull,
      type: z.enum(["chat", "reasoning", "embedding", "vision", "image", "audio", "rerank", "unknown"]).default("unknown"),
      contextWindow: z.number().nullable(),
      maxOutputTokens: z.number().nullable(),
      supportsStreaming: z.boolean().nullable(),
      supportsVision: z.boolean().nullable(),
      supportsTools: z.boolean().nullable(),
      supportsJsonMode: z.boolean().nullable(),
      notes: stringOrNull
    })
  ),
  minimalRequests: z.object({
    chat: z.object({
      method: stringOrNull,
      url: stringOrNull,
      headers: z.record(z.any()).default({}),
      body: z.record(z.any()).default({})
    }),
    modelsList: z.object({
      method: stringOrNull,
      url: stringOrNull,
      headers: z.record(z.any()).default({})
    })
  }),
  codeExamples: z.object({
    curl: stringOrNull,
    python: stringOrNull,
    javascript: stringOrNull
  }),
  commonErrors: z.array(
    z.object({
      error: stringOrNull,
      reason: stringOrNull,
      solution: stringOrNull
    })
  ),
  limits: z.object({
    rateLimit: stringOrNull,
    quota: stringOrNull,
    notes: stringOrNull
  }),
  clientConfigGuide: clientConfigGuideSchema,
  analysisMeta: z.object({
    confidence: z.number().min(0).max(100).default(0),
    unknownFields: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
    sourceUrls: z.array(z.string()).default([])
  })
});

const optionalTrimmedString = (max: number) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.string().max(max).optional());

const fetchDocSchema = z
  .object({
    url: z.string().url(),
    providerName: optionalTrimmedString(100),
    /** 仅在明确为 true 时启用；默认 false，保持原有单页抓取行为 */
    recursiveSameOrigin: z.boolean().optional().default(false),
    /** 与同站递归互斥：按 robots / sitemap 发现同主机名 URL 后顺序抓取 */
    fromSitemap: z.boolean().optional().default(false),
    /** 与上述二者互斥：经 GitHub REST 拉取仓库默认 README 原始 Markdown */
    fromGithubReadme: z.boolean().optional().default(false),
    /** 与其它扩展模式互斥：下载 URL 指向的 OpenAPI 3.x / Swagger 2.0 JSON 并转为 Markdown 摘要 */
    fromOpenApi: z.boolean().optional().default(false),
    /** 递归或 sitemap 模式下最多抓取的页面数（含起始页） */
    maxPages: z.number().int().min(1).max(30).optional().default(10)
  })
  .refine((d) => [d.recursiveSameOrigin, d.fromSitemap, d.fromGithubReadme, d.fromOpenApi].filter(Boolean).length <= 1, {
    message: "recursiveSameOrigin、fromSitemap、fromGithubReadme、fromOpenApi 至多启用一项",
    path: ["fromOpenApi"]
  });

const sitemapDiscoverSchema = z.object({
  url: z.string().url(),
  maxUrls: z.number().int().min(1).max(2000).optional().default(500),
  /** 仅保留与输入 URL 相同主机名的页面地址 */
  sameOriginOnly: z.boolean().optional().default(true)
});

/** 批量比对 ProviderDoc 与远程抓取结果的 SHA256（不写库）。 */
const docCheckUpdatesSchema = z.object({
  providerIds: z.array(z.string().min(1)).optional()
});

const docDiffVersionsSchema = z.object({
  docId: z.string().min(1)
});

const analyzeSchema = z.object({
  url: z.string().url(),
  providerName: z.string().optional().nullable(),
  markdown: z.string().min(50)
});

const saveProviderSchema = z.object({
  analysis: z.unknown(),
  sourceMarkdown: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceTitle: z.string().optional()
});

const testSchema = z
  .object({
    providerId: z.string().optional(),
    /** 客户端声明的接入协议画像，仅占位与未来扩展；服务端仍以 testType 决定实际调用路径 */
    providerProtocol: z.enum(["openai-compatible", "ollama", "gemini"]).optional(),
    apiKey: z.string().optional().default(""),
    baseUrl: z.string().url(),
    model: z.string().optional(),
    testType: z
      .enum(["chat", "models", "ollama", "gemini", "chat-min", "code-min", "json-min"])
      .default("chat"),
    maxTokens: z.number().int().min(1).max(32).default(1),
    timeoutMs: z.number().int().min(1000).max(120000).default(30000)
  })
  .superRefine((d, ctx) => {
    if (d.testType === "ollama") return;
    if (!String(d.apiKey ?? "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "chat / models / gemini / 低成本探测测试需要填写 API Key（Gemini 为 AI Studio Key）",
        path: ["apiKey"]
      });
    }
  });

const integrationRenderBodySchema = z.object({
  profileId: z.string().min(1),
  targetId: z.string().min(1),
  providerId: z.string().optional(),
  baseUrl: z.string().url().optional(),
  modelName: z.string().optional()
});

/** 知识库导出 / 导入：仅含 Provider 及其文档、模型与示例（不含测试记录）。 */
const KNOWLEDGE_FORMAT_VERSION = 1 as const;

const exportedModelSchema = z.object({
  name: z.string().min(1),
  type: z.string().nullable().optional(),
  contextWindow: z.number().int().nullable().optional(),
  maxOutputTokens: z.number().int().nullable().optional(),
  supportsStreaming: z.boolean().nullable().optional(),
  supportsVision: z.boolean().nullable().optional(),
  supportsTools: z.boolean().nullable().optional(),
  supportsJsonMode: z.boolean().nullable().optional(),
  notes: z.string().nullable().optional()
});

const exportedDocSchema = z.object({
  url: z.string().min(1),
  title: z.string().nullable().optional(),
  contentMarkdown: z.string(),
  contentHash: z.string().min(1)
});

const exportedCodeSchema = z.object({
  language: z.string().min(1),
  code: z.string()
});

const exportedCommonErrorSchema = z.object({
  error: z.string().min(1),
  reason: z.string().nullable().optional(),
  solution: z.string().nullable().optional()
});

const knowledgeExportedProviderSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  docsUrl: z.string().min(1),
  officialWebsite: z.string().nullable().optional(),
  isOpenAICompatible: z.boolean().nullable().optional(),
  compatibleLevel: z.string().nullable().optional(),
  baseUrl: z.string().nullable().optional(),
  authType: z.string().nullable().optional(),
  authHeaderName: z.string().nullable().optional(),
  authHeaderTemplate: z.string().nullable().optional(),
  chatCompletionsPath: z.string().nullable().optional(),
  embeddingsPath: z.string().nullable().optional(),
  modelsPath: z.string().nullable().optional(),
  rawAnalysisJson: z.string().refine((s) => {
    try {
      JSON.parse(s);
      return true;
    } catch {
      return false;
    }
  }, "rawAnalysisJson 须为合法 JSON 字符串"),
  models: z.array(exportedModelSchema).default([]),
  docs: z.array(exportedDocSchema).default([]),
  codeExamples: z.array(exportedCodeSchema).default([]),
  commonErrors: z.array(exportedCommonErrorSchema).default([])
});

type KnowledgeExportedProvider = z.infer<typeof knowledgeExportedProviderSchema>;

const knowledgeImportBodySchema = z.preprocess((raw: unknown) => {
  if (typeof raw !== "object" || raw === null) return raw;
  const o = raw as Record<string, unknown>;
  if (typeof o.knowledge === "object" && o.knowledge !== null && !Array.isArray(o.knowledge)) {
    const k = o.knowledge as Record<string, unknown>;
    return {
      formatVersion: k.formatVersion ?? o.formatVersion ?? KNOWLEDGE_FORMAT_VERSION,
      providers: k.providers ?? o.providers,
      mode: o.mode ?? k.mode ?? "merge"
    };
  }
  if ("providers" in o && Array.isArray(o.providers)) {
    return {
      formatVersion: o.formatVersion ?? KNOWLEDGE_FORMAT_VERSION,
      providers: o.providers,
      mode: typeof o.mode === "string" ? o.mode : "merge"
    };
  }
  return raw;
}, z.object({
  formatVersion: z.literal(KNOWLEDGE_FORMAT_VERSION),
  providers: z.array(knowledgeExportedProviderSchema),
  mode: z.enum(["merge", "replace"]).default("merge")
}));

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

async function allocateUniqueSlug(slugBaseRaw: string, tx?: Prisma.TransactionClient): Promise<string> {
  const db = tx ?? prisma;
  const base = toSlug(slugBaseRaw) || `provider-${Date.now().toString(36)}`;
  let slug = base;
  let idx = 1;
  while (await db.provider.findUnique({ where: { slug } })) {
    slug = `${base}-${idx++}`.slice(0, 80);
  }
  return slug;
}

function serializeProviderForExport(p: {
  slug: string;
  name: string;
  description: string | null;
  docsUrl: string;
  officialWebsite: string | null;
  isOpenAICompatible: boolean | null;
  compatibleLevel: string | null;
  baseUrl: string | null;
  authType: string | null;
  authHeaderName: string | null;
  authHeaderTemplate: string | null;
  chatCompletionsPath: string | null;
  embeddingsPath: string | null;
  modelsPath: string | null;
  rawAnalysisJson: string;
  models: Array<{
    name: string;
    type: string | null;
    contextWindow: number | null;
    maxOutputTokens: number | null;
    supportsStreaming: boolean | null;
    supportsVision: boolean | null;
    supportsTools: boolean | null;
    supportsJsonMode: boolean | null;
    notes: string | null;
  }>;
  docs: Array<{ url: string; title: string | null; contentMarkdown: string; contentHash: string }>;
  codeExamples: Array<{ language: string; code: string }>;
  commonErrors: Array<{ error: string; reason: string | null; solution: string | null }>;
}): KnowledgeExportedProvider {
  return {
    slug: p.slug,
    name: p.name,
    description: p.description,
    docsUrl: p.docsUrl,
    officialWebsite: p.officialWebsite,
    isOpenAICompatible: p.isOpenAICompatible,
    compatibleLevel: p.compatibleLevel,
    baseUrl: p.baseUrl,
    authType: p.authType,
    authHeaderName: p.authHeaderName,
    authHeaderTemplate: p.authHeaderTemplate,
    chatCompletionsPath: p.chatCompletionsPath,
    embeddingsPath: p.embeddingsPath,
    modelsPath: p.modelsPath,
    rawAnalysisJson: p.rawAnalysisJson,
    models: p.models.map((m) => ({
      name: m.name,
      type: m.type,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
      supportsStreaming: m.supportsStreaming,
      supportsVision: m.supportsVision,
      supportsTools: m.supportsTools,
      supportsJsonMode: m.supportsJsonMode,
      notes: m.notes
    })),
    docs: p.docs.map((d) => ({
      url: d.url,
      title: d.title,
      contentMarkdown: d.contentMarkdown,
      contentHash: d.contentHash
    })),
    codeExamples: p.codeExamples.map((c) => ({ language: c.language, code: c.code })),
    commonErrors: p.commonErrors.map((e) => ({ error: e.error, reason: e.reason, solution: e.solution }))
  };
}

async function createProviderFromExport(ep: KnowledgeExportedProvider, slug: string, tx?: Prisma.TransactionClient) {
  const db = tx ?? prisma;
  let docs = [...ep.docs];
  if (docs.length === 0) {
    const markdown = `_（从备份导入，原数据无文档正文）_\n\nslug: ${ep.slug}\n`;
    docs = [
      {
        url: ep.docsUrl,
        title: ep.name,
        contentMarkdown: markdown,
        contentHash: createHash("sha256").update(markdown).digest("hex")
      }
    ];
  }
  await db.provider.create({
    data: {
      slug,
      name: ep.name,
      description: ep.description ?? null,
      docsUrl: ep.docsUrl,
      officialWebsite: ep.officialWebsite ?? null,
      isOpenAICompatible: ep.isOpenAICompatible ?? null,
      compatibleLevel: ep.compatibleLevel ?? null,
      baseUrl: ep.baseUrl ?? null,
      authType: ep.authType ?? null,
      authHeaderName: ep.authHeaderName ?? null,
      authHeaderTemplate: ep.authHeaderTemplate ?? null,
      chatCompletionsPath: ep.chatCompletionsPath ?? null,
      embeddingsPath: ep.embeddingsPath ?? null,
      modelsPath: ep.modelsPath ?? null,
      rawAnalysisJson: ep.rawAnalysisJson,
      docs: {
        create: docs.map((d) => ({
          url: d.url,
          title: d.title ?? null,
          contentMarkdown: d.contentMarkdown,
          contentHash: d.contentHash
        }))
      },
      models: {
        create: ep.models
          .filter((m) => m.name?.trim())
          .map((m) => ({
            name: m.name.trim(),
            type: m.type ?? null,
            contextWindow: m.contextWindow ?? null,
            maxOutputTokens: m.maxOutputTokens ?? null,
            supportsStreaming: m.supportsStreaming ?? null,
            supportsVision: m.supportsVision ?? null,
            supportsTools: m.supportsTools ?? null,
            supportsJsonMode: m.supportsJsonMode ?? null,
            notes: m.notes ?? null
          }))
      },
      codeExamples: {
        create: ep.codeExamples.filter((c) => c.code?.trim()).map((c) => ({ language: c.language, code: c.code }))
      },
      commonErrors: {
        create: ep.commonErrors.filter((e) => e.error?.trim()).map((e) => ({
          error: e.error.trim(),
          reason: e.reason ?? null,
          solution: e.solution ?? null
        }))
      }
    }
  });
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/g, "");
}

function isFullChatCompletionsUrl(url: string): boolean {
  return /\/chat\/completions\/?$/i.test(normalizeBaseUrl(url));
}

function detectLikelyBaseUrlMistake(baseUrl: string, finalUrl?: string): string[] {
  const target = `${normalizeBaseUrl(baseUrl)} ${finalUrl ?? ""}`.toLowerCase();
  const hints: string[] = [];
  if (isFullChatCompletionsUrl(baseUrl)) {
    hints.push("你填的 Base URL 看起来已经是完整 /chat/completions 地址。大多数软件只要填到 /v1，不要把完整接口填进 Base URL。");
  }
  if (target.includes("/v1/v1")) hints.push("URL 里出现了 /v1/v1，像是 /v1 重复拼接了。");
  if (target.includes("/chat/completions/chat/completions")) hints.push("URL 里出现了重复的 /chat/completions，像是把完整接口当 Base URL 填了。");
  if (target.includes("/v1/chat/completions/chat/completions")) hints.push("URL 里出现了 /v1/chat/completions/chat/completions，通常是软件又自动拼了一次接口路径。");
  return [...new Set(hints)];
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const cleanBase = normalizeBaseUrl(baseUrl);
  if (isFullChatCompletionsUrl(cleanBase)) return cleanBase;
  return cleanBase.endsWith("/v1") ? `${cleanBase}/chat/completions` : `${cleanBase}/v1/chat/completions`;
}

function buildModelsUrl(baseUrl: string): string {
  const cleanBase = normalizeBaseUrl(baseUrl);
  const withoutChat = cleanBase.replace(/\/chat\/completions$/i, "");
  return withoutChat.endsWith("/v1") ? `${withoutChat}/models` : `${withoutChat}/v1/models`;
}

function buildEndpointUrl(baseUrl: string, endpoint?: string | null): string {
  const cleanBase = normalizeBaseUrl(baseUrl);
  if (!endpoint) return buildChatCompletionsUrl(cleanBase);
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const ep = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  if (ep === "/chat/completions") return buildChatCompletionsUrl(cleanBase);
  if (cleanBase.endsWith("/v1") && ep.startsWith("/v1/")) return `${cleanBase}${ep.slice(3)}`;
  return `${cleanBase}${ep}`;
}

function alternateChatEndpoint(baseUrl: string): string {
  const cleanBase = normalizeBaseUrl(baseUrl);
  if (isFullChatCompletionsUrl(cleanBase)) return cleanBase.replace(/\/chat\/completions$/i, "");
  return cleanBase.endsWith("/v1") ? `${cleanBase.replace(/\/v1$/, "")}/chat/completions` : `${cleanBase}/v1/chat/completions`;
}

/** 从含 `/v1` 的 OpenAI 兼容 base 推导 Ollama 服务根（原生 `/api/*` 挂在根上）。 */
function ollamaServerRootUrl(baseUrlStr: string): string {
  const u = new URL(normalizeBaseUrl(baseUrlStr));
  let path = u.pathname.replace(/\/+$/, "") || "";
  if (path.endsWith("/v1")) {
    u.pathname = path.slice(0, -3) || "/";
  }
  return normalizeBaseUrl(u.toString());
}

async function probeOllamaNative(baseRoot: string, timeoutMs: number): Promise<{ version: string; modelNames: string[] }> {
  const versionUrl = `${baseRoot}/api/version`;
  const tagsUrl = `${baseRoot}/api/tags`;
  const vRes = await axios.get<{ version?: string }>(versionUrl, { timeout: timeoutMs, validateStatus: () => true });
  if (vRes.status < 200 || vRes.status >= 300) {
    throw new Error(`Ollama GET /api/version 失败 HTTP ${vRes.status}`);
  }
  const version = typeof vRes.data?.version === "string" ? vRes.data.version : "unknown";

  const tRes = await axios.get<{ models?: Array<{ name?: string }> }>(tagsUrl, { timeout: timeoutMs, validateStatus: () => true });
  if (tRes.status < 200 || tRes.status >= 300) {
    throw new Error(`Ollama GET /api/tags 失败 HTTP ${tRes.status}`);
  }
  const modelNames = (tRes.data?.models ?? []).map((m) => m.name).filter((n): n is string => Boolean(n && String(n).trim()));

  return { version, modelNames };
}

function geminiGenerateContentEndpoint(apiRoot: string, modelId: string): string {
  const root = normalizeBaseUrl(apiRoot);
  return `${root}/models/${encodeURIComponent(modelId)}:generateContent`;
}

function extractGeminiText(data: unknown): string | undefined {
  const d = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = d?.candidates?.[0]?.content?.parts;
  if (!parts?.length) return undefined;
  const joined = parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
  return joined.trim() || undefined;
}

/** Gemini generateContent 响应中的用量元数据（若存在）。 */
function extractGeminiUsageMetadata(data: unknown): Record<string, unknown> | undefined {
  const d = data as { usageMetadata?: unknown };
  if (d?.usageMetadata != null && typeof d.usageMetadata === "object" && !Array.isArray(d.usageMetadata)) {
    return d.usageMetadata as Record<string, unknown>;
  }
  return undefined;
}

const USAGE_SNAPSHOT_MAX_CHARS = 2048;

/** 将用量对象安全序列化存入 TestRecord（截断；不落密钥）。 */
function stringifyUsageSnapshot(usage: unknown): string | undefined {
  if (usage == null || typeof usage !== "object") return undefined;
  try {
    const s = JSON.stringify(usage);
    if (s.length > USAGE_SNAPSHOT_MAX_CHARS) return `${s.slice(0, USAGE_SNAPSHOT_MAX_CHARS)}…`;
    return s;
  } catch {
    return undefined;
  }
}

function maskBaseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.hostname}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    return raw.slice(0, 40);
  }
}

function stringifyErr(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return JSON.stringify(error);
}

function hintsForDocFetchFailure(message: string): string[] {
  const m = message.toLowerCase();
  const hints: string[] = [];
  if (m.includes("robots.txt") || (m.includes("user-agent") && m.includes("禁止"))) {
    hints.push("若为 robots 限制：可尝试镜像文档链接或勾选 OpenAPI 模式改用可直接下载的 JSON 规范地址。");
  }
  if (m.includes("timeout") || m.includes("etimedout")) hints.push("网络超时：稍后重试，或检查本机网络与目标站点可达性。");
  if (m.includes("openapi") || m.includes("swagger") || m.includes("json")) {
    hints.push("OpenAPI 模式：确认 URL 返回合法 JSON（非 YAML）；体积须不超过当前 5MB 上限。");
  }
  if (m.includes("未识别的规范")) hints.push("规范顶层须包含 openapi（3.x）或 swagger: \"2.0\"。");
  if (m.includes("github")) hints.push("GitHub：匿名请求可能限速；私有仓库需在 .env 配置 GITHUB_TOKEN。");
  if (m.includes("ssrf") || m.includes("内网") || m.includes("localhost") || m.includes("禁止解析")) {
    hints.push("仅允许公网 http(s)；不要使用 localhost、内网或未对外开放的上游地址。");
  }
  if ((m.includes("sitemap") || m.includes("递归")) && (m.includes("未能") || m.includes("跳过"))) {
    hints.push("多页抓取：起始页需可访问；SPA 壳页可能导致正文过少，可改为单页 API 文档或 OpenAPI JSON。");
  }
  return [...new Set(hints)].slice(0, 6);
}

function hintsForAnalyzeRepairFailure(repairSteps: string[], rawSummary: string): string[] {
  const hints: string[] = [];
  const joined = `${repairSteps.join(" | ")} ${rawSummary}`.toLowerCase();
  if (joined.includes("fence") || joined.includes("```") || joined.includes("围栏")) {
    hints.push("模型常在 JSON 外夹杂 Markdown；可更换指令遵循更强的分析模型，或确认 ANALYZER_MODEL 输出稳定 JSON。");
  }
  if (repairSteps.some((s) => /truncate|slice|截取/i.test(s))) {
    hints.push("已从响应中截取 JSON 片段；若仍失败可缩短输入 Markdown 或在分析侧提高允许输出长度。");
  }
  if (hints.length === 0) {
    hints.push("请对照响应中的 repairSteps、rawSummary；抓取正文噪声过大时也可能导致解析失败。");
  }
  return [...new Set(hints)].slice(0, 5);
}

function hintsForAnalyzeStructureIssues(
  repairSteps: string[],
  issues: Array<{ path: string; message: string }>,
  rawSummary: string
): string[] {
  const pathStr = issues.map((i) => i.path).join(" ");
  const extra: string[] = [];
  if (pathStr.includes("minimalRequests") || pathStr.includes("endpoints")) {
    extra.push("嵌套结构未通过 Zod：建议切换到「JSON 源码」，按 issues 中的 path 修正 minimalRequests / endpoints 等字段。");
  }
  return [...extra, ...hintsForAnalyzeRepairFailure(repairSteps, rawSummary)].filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 6);
}

function hintsForAnalyzerTransport(message: string): string[] {
  const m = message.toLowerCase();
  const hints: string[] = [];
  if (m.includes("401") || m.includes("403")) {
    hints.push("分析网关鉴权失败：核对 ANALYZER_API_KEY 与 ANALYZER_BASE_URL（须 OpenAI 兼容 /chat/completions）。");
  }
  if (m.includes("429")) hints.push("分析接口限速：稍后重试或更换配额。");
  if (m.includes("enotfound") || m.includes("econnrefused") || m.includes("fetch failed") || m.includes("socket")) {
    hints.push("无法连接 ANALYZER_BASE_URL：检查 .env、防火墙与 DNS。");
  }
  return [...new Set(hints)].slice(0, 5);
}

type QuickFix = {
  id: string;
  label: string;
  description: string;
  patch: {
    baseUrl?: string;
    model?: string;
    testType?: "chat" | "models" | "ollama" | "gemini" | "chat-min" | "code-min" | "json-min";
    apiKeyAction?: "replace" | "trim";
  };
};

function uniqueQuickFixes(rows: QuickFix[]): QuickFix[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = JSON.stringify(row.patch);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

function baseUrlFixCandidates(baseUrl: string): QuickFix[] {
  const clean = normalizeBaseUrl(baseUrl);
  const rows: QuickFix[] = [];
  const withoutDuplicateV1 = clean.replace(/\/v1\/v1(?:\/|$)/i, "/v1/");
  if (withoutDuplicateV1 !== clean) {
    rows.push({
      id: "fix-duplicate-v1",
      label: "去掉重复 /v1",
      description: "URL 里像是出现了 /v1/v1，先把它压成一个 /v1 再测。",
      patch: { baseUrl: normalizeBaseUrl(withoutDuplicateV1) }
    });
  }
  const withoutChat = clean.replace(/\/chat\/completions(?:\/chat\/completions)?$/i, "");
  if (withoutChat !== clean) {
    rows.push({
      id: "base-url-to-v1",
      label: "Base URL 改到 /v1",
      description: "你可能把完整接口填进了 Base URL。大多数软件只要填到 /v1。",
      patch: { baseUrl: normalizeBaseUrl(withoutChat) }
    });
  }
  if (!/\/v1$/i.test(clean) && !/\/chat\/completions$/i.test(clean)) {
    rows.push({
      id: "append-v1",
      label: "末尾加 /v1",
      description: "很多 OpenAI Compatible 平台的 Base URL 需要以 /v1 结尾。",
      patch: { baseUrl: `${clean}/v1` }
    });
  }
  if (/\/v1$/i.test(clean)) {
    rows.push({
      id: "remove-v1",
      label: "试试不带 /v1",
      description: "少数平台或代理会自己挂载 /v1，404 时可以试一次不带 /v1。",
      patch: { baseUrl: clean.replace(/\/v1$/i, "") }
    });
  }
  return uniqueQuickFixes(rows);
}

function diagnoseError(httpStatus?: number, responseBody?: string, networkError?: string, urlHints: string[] = [], quickFixes: QuickFix[] = []) {
  const body = `${responseBody ?? ""} ${networkError ?? ""}`.toLowerCase();
  const withHints = (suggestion: string) => [suggestion, ...urlHints].filter(Boolean).join(" ");
  const withFixes = (diag: { type: string; reason: string; suggestion: string }, fixes: QuickFix[] = []) => ({
    ...diag,
    quickFixes: uniqueQuickFixes([...fixes, ...quickFixes])
  });
  if (httpStatus && httpStatus >= 200 && httpStatus <= 299) {
    return withFixes({ type: "SUCCESS", reason: "连接成功", suggestion: "当前配置可用，可以复制到目标软件里继续使用。" });
  }
  if (httpStatus === 402 || body.includes("quota") || body.includes("insufficient_quota") || body.includes("balance") || body.includes("payment")) {
    return withFixes({ type: "QUOTA_ERROR", reason: "额度可能不够", suggestion: "账号余额、免费额度或调用额度可能不足。建议检查平台控制台额度。" });
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return withFixes(
      { type: "AUTH_ERROR", reason: "API Key 好像不对", suggestion: "服务器拒绝了你的 Key，可能是填错、过期、没额度，或没有调用该模型的权限。重新复制平台后台的 API Key，注意不要多复制空格。" },
      [
        {
          id: "trim-api-key",
          label: "去掉 Key 前后空格",
          description: "如果复制时带了空格或换行，先清理后再测。",
          patch: { apiKeyAction: "trim" }
        }
      ]
    );
  }
  if (httpStatus === 404) {
    return withFixes({
      type: "ENDPOINT_ERROR",
      reason: "URL 可能填堵了",
      suggestion: withHints("接口地址没有找到。常见原因是 /v1 少了、/v1 重复了、或者把 /chat/completions 填到了 Base URL 里。通常 Base URL 填到 /v1 即可，不要填完整 /chat/completions。")
    });
  }
  if (httpStatus === 400 && (body.includes("model_not_found") || body.includes("model"))) {
    return withFixes({ type: "MODEL_ERROR", reason: "模型名可能填错了", suggestion: "平台找不到这个模型名。回到文档里复制完整模型名，不要自己简写。" });
  }
  if (httpStatus === 400 && (body.includes("invalid_request") || body.includes("invalid request"))) {
    return withFixes(
      { type: "REQUEST_FORMAT_ERROR", reason: "请求格式不符合平台要求", suggestion: "平台觉得请求体不合规。先用最小 chat-min 测试，减少变量。" },
      [{ id: "switch-chat-min", label: "改用 chat-min", description: "用最小请求体重新测试，排除复杂参数影响。", patch: { testType: "chat-min" } }]
    );
  }
  if (httpStatus === 422) {
    return withFixes(
      { type: "REQUEST_FORMAT_ERROR", reason: "参数格式没过平台校验", suggestion: "422 通常表示字段、模型名或 endpoint 被平台拒绝。先切到最小请求，再检查模型名是否完全一致。" },
      [{ id: "switch-chat-min-422", label: "改用最小请求", description: "先用 chat-min 排除复杂参数。", patch: { testType: "chat-min" } }]
    );
  }
  if (httpStatus === 429) {
    return withFixes({ type: "RATE_LIMIT", reason: "请求太快了", suggestion: "平台限制了你的请求频率。稍后再试，或检查套餐限制。" });
  }
  if (body.includes("timeout") || body.includes("etimedout")) {
    return withFixes({ type: "TIMEOUT", reason: "请求超时", suggestion: "请求一直没等到响应。检查网络、代理和平台服务状态。" });
  }
  if (body.includes("enotfound") || body.includes("econnrefused") || body.includes("fetch failed")) {
    return withFixes({ type: "NETWORK_ERROR", reason: "网络连接失败", suggestion: "检查域名可达性、端口、防火墙和代理。" });
  }
  return withFixes({ type: "UNKNOWN", reason: "未知错误", suggestion: withHints("检查响应详情、接口路径、API Key 与模型名配置。") });
}

function isPrivateIp(ip: string): boolean {
  if (net.isIP(ip) === 4) {
    if (ip.startsWith("10.")) return true;
    if (ip.startsWith("127.")) return true;
    if (ip.startsWith("192.168.")) return true;
    const seg = ip.split(".").map(Number);
    if (seg[0] === 172 && seg[1] >= 16 && seg[1] <= 31) return true;
    if (ip === "0.0.0.0") return true;
  }
  if (net.isIP(ip) === 6) {
    const low = ip.toLowerCase();
    if (low === "::1") return true;
    if (low.startsWith("fc") || low.startsWith("fd")) return true;
  }
  return false;
}

async function validateSafeUrl(input: string): Promise<URL> {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("只允许 http/https URL");
  const host = url.hostname.toLowerCase();
  if (host === "localhost") throw new Error("禁止 localhost");
  if (host === "0.0.0.0" || host === "127.0.0.1" || host === "::1") throw new Error("禁止本地回环地址");
  if (net.isIP(host) && isPrivateIp(host)) throw new Error("禁止内网 IP 地址");
  const records = await lookup(host, { all: true });
  for (const rec of records) {
    if (isPrivateIp(rec.address)) throw new Error("禁止解析到内网地址，疑似 SSRF");
  }
  return url;
}

function normalizeFetchUrlString(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  return u.toString();
}

/** 从仓库页 URL 解析 owner/repo（默认 README API；不支持深层 blob 路径）。 */
function parseGithubRepoFromUrl(pageUrl: string): { owner: string; repo: string } | null {
  let u: URL;
  try {
    u = new URL(pageUrl);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  const reserved = new Set(["settings", "orgs", "topics", "sponsors", "explore", "login", "signup", "marketplace", "features"]);
  if (reserved.has(owner.toLowerCase())) return null;
  return { owner, repo };
}

async function fetchGithubRepoReadmeMarkdown(pageUrl: string): Promise<{
  title: string;
  markdown: string;
  owner: string;
  repo: string;
}> {
  const parsed = parseGithubRepoFromUrl(pageUrl);
  if (!parsed) throw new Error("无法解析 GitHub 仓库 URL（请使用 https://github.com/owner/repo 形式）");

  const apiPath = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/readme`;
  await validateSafeUrl(apiPath);

  const token = process.env.GITHUB_TOKEN?.trim();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.raw",
    "User-Agent": "Model-Plunger/0.1"
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await axios.get<string>(apiPath, {
    timeout: 20_000,
    responseType: "text",
    headers,
    validateStatus: () => true
  });

  if (res.status === 404) {
    throw new Error("未找到仓库默认 README（仓库不存在、无 README，或私有仓库未配置 GITHUB_TOKEN）");
  }
  if (res.status === 403) {
    throw new Error("GitHub API 拒绝访问（匿名 API 限速或未授权私有仓库；可在 .env 配置 GITHUB_TOKEN）");
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`GitHub API 错误 HTTP ${res.status}`);
  }

  const markdown = (typeof res.data === "string" ? res.data : String(res.data ?? "")).trim();
  if (!markdown) throw new Error("README 内容为空");
  if (Buffer.byteLength(markdown, "utf8") > MAX_DOC_SIZE) throw new Error("README 超过 5MB 限制");

  return {
    title: `${parsed.owner}/${parsed.repo} README`,
    markdown,
    owner: parsed.owner,
    repo: parsed.repo
  };
}

const OPENAPI_HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head", "trace"]);
const MAX_OPENAPI_OPERATIONS_IN_MARKDOWN = 280;

/** 将 paths 对象追加为 Markdown（每条 operation 一行摘要；过大时截断）。 */
function appendOpenApiPathsMarkdown(lines: string[], pathsRaw: unknown, maxOps: number): number {
  if (!pathsRaw || typeof pathsRaw !== "object") return 0;
  const paths = pathsRaw as Record<string, unknown>;
  let count = 0;
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (count >= maxOps) break;
    if (pathKey.startsWith("x-")) continue;
    if (!pathItem || typeof pathItem !== "object") continue;

    const opBlocks: string[] = [];
    for (const [method, op] of Object.entries(pathItem as Record<string, unknown>)) {
      if (count >= maxOps) break;
      const m = method.toLowerCase();
      if (!OPENAPI_HTTP_METHODS.has(m)) continue;
      if (!op || typeof op !== "object") continue;
      const opr = op as Record<string, unknown>;
      const summary = opr.summary != null ? String(opr.summary) : "";
      const desc = opr.description != null ? String(opr.description) : "";
      opBlocks.push(`- **${m.toUpperCase()}**${summary ? `: ${summary}` : ""}`);
      if (desc && desc !== summary) {
        const clip = desc.length > 600 ? `${desc.slice(0, 600)}…` : desc;
        opBlocks.push(`  ${clip.replace(/\s+/g, " ").trim()}`);
      }
      count++;
    }

    if (opBlocks.length === 0) continue;
    lines.push("", `### \`${pathKey}\``);
    lines.push(...opBlocks);
  }
  return count;
}

async function fetchOpenApiJson(url: string): Promise<unknown> {
  const norm = normalizeFetchUrlString(url);
  await validateSafeUrl(norm);
  const u = new URL(norm);
  const originRoot = `${u.protocol}//${u.hostname}`;
  const starRules = await fetchRobotsRulesForOrigin(originRoot);
  if (!isAllowedByRobotsUrl(norm, starRules)) {
    throw new Error("robots.txt（User-agent *）禁止抓取该 URL");
  }
  const throttle = createRobotsThrottle(starRules?.crawlDelayMs ?? null);
  await throttle.beforeFetch();
  try {
    const res = await axios.get(norm, {
      timeout: 20_000,
      maxRedirects: 5,
      responseType: "text",
      headers: {
        accept: "application/json,*/*",
        "user-agent": "Model-Plunger/0.1"
      },
      validateStatus: () => true
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`下载 OpenAPI 文档 HTTP ${res.status}`);
    }
    const raw = typeof res.data === "string" ? res.data : String(res.data ?? "");
    if (Buffer.byteLength(raw, "utf8") > MAX_DOC_SIZE) throw new Error("OpenAPI JSON 超过 5MB 限制");
    return JSON.parse(raw) as unknown;
  } finally {
    throttle.afterFetch();
  }
}

function openApiSpecToMarkdown(spec: unknown): { title: string; markdown: string; variant: "openapi3" | "swagger2" } {
  if (!spec || typeof spec !== "object") throw new Error("OpenAPI 文档须为 JSON 对象");
  const root = spec as Record<string, unknown>;

  if (typeof root.openapi === "string" && root.openapi.startsWith("3")) {
    const info = (root.info ?? {}) as Record<string, unknown>;
    const title = String(info.title ?? "OpenAPI");
    const lines: string[] = [`# ${title}`];
    if (info.version != null) lines.push("", `**API version:** ${String(info.version)}`);
    if (info.description != null) lines.push("", String(info.description));

    const servers = Array.isArray(root.servers) ? root.servers : [];
    if (servers.length) {
      lines.push("", "## Servers");
      for (const s of servers as Array<Record<string, unknown>>) {
        const desc = s.description != null ? String(s.description) : "";
        lines.push(`- \`${String(s.url ?? "")}\`${desc ? ` — ${desc}` : ""}`);
      }
    }

    lines.push("", "## Operations");
    const n = appendOpenApiPathsMarkdown(lines, root.paths, MAX_OPENAPI_OPERATIONS_IN_MARKDOWN);
    if (n >= MAX_OPENAPI_OPERATIONS_IN_MARKDOWN) {
      lines.push("", `_…（paths 下 operation 过多，已截断至约 ${MAX_OPENAPI_OPERATIONS_IN_MARKDOWN} 条）_`);
    }

    const comps = (root.components ?? {}) as Record<string, unknown>;
    const schemes = comps.securitySchemes as Record<string, unknown> | undefined;
    if (schemes && typeof schemes === "object" && Object.keys(schemes).length) {
      lines.push("", "## Security schemes");
      for (const [name, scheme] of Object.entries(schemes)) {
        if (!scheme || typeof scheme !== "object") continue;
        const sch = scheme as Record<string, unknown>;
        const st = String(sch.type ?? "");
        const extra =
          st === "http"
            ? ` scheme=${String(sch.scheme ?? "")}`
            : st === "apiKey"
              ? ` in=${String(sch.in ?? "")} name=${String(sch.name ?? "")}`
              : "";
        lines.push(`- **${name}** (${st})${extra}`);
      }
    }

    const markdown = lines.join("\n").trim();
    if (markdown.length < 50) throw new Error("生成的 Markdown 过短，规范可能为空");
    return { title, markdown, variant: "openapi3" };
  }

  if (root.swagger === "2.0") {
    const info = (root.info ?? {}) as Record<string, unknown>;
    const title = String(info.title ?? "Swagger API");
    const lines: string[] = [`# ${title}`];
    if (info.version != null) lines.push("", `**API version:** ${String(info.version)}`);
    if (info.description != null) lines.push("", String(info.description));

    const schemes = Array.isArray(root.schemes) ? (root.schemes as unknown[]).map(String) : ["https"];
    const host = root.host != null ? String(root.host) : "";
    const basePath = root.basePath != null ? String(root.basePath) : "";
    if (host || basePath) {
      lines.push("", "## Base URL（推导）");
      for (const sch of schemes.slice(0, 6)) {
        lines.push(`- \`${sch}://${host}${basePath}\``);
      }
    }

    lines.push("", "## Operations");
    const n = appendOpenApiPathsMarkdown(lines, root.paths, MAX_OPENAPI_OPERATIONS_IN_MARKDOWN);
    if (n >= MAX_OPENAPI_OPERATIONS_IN_MARKDOWN) {
      lines.push("", `_…（paths 下 operation 过多，已截断至约 ${MAX_OPENAPI_OPERATIONS_IN_MARKDOWN} 条）_`);
    }

    const secDefs = root.securityDefinitions as Record<string, unknown> | undefined;
    if (secDefs && typeof secDefs === "object" && Object.keys(secDefs).length) {
      lines.push("", "## Security definitions");
      for (const [name, def] of Object.entries(secDefs)) {
        if (!def || typeof def !== "object") continue;
        const d = def as Record<string, unknown>;
        lines.push(`- **${name}**: ${String(d.type ?? "?")}`);
      }
    }

    const markdown = lines.join("\n").trim();
    if (markdown.length < 50) throw new Error("生成的 Markdown 过短，规范可能为空");
    return { title, markdown, variant: "swagger2" };
  }

  throw new Error("未识别的规范（需要 OpenAPI 3.x 的 openapi 字段或 Swagger 2.0 的 swagger: \"2.0\"）");
}

/** 解析页内 `<base href>`，用于相对链接解析 */
function resolvePageBase(pageUrl: string, html: string): URL {
  const $ = load(html);
  const baseHref = $("base[href]").first().attr("href")?.trim();
  if (baseHref) {
    try {
      return new URL(baseHref, pageUrl);
    } catch {
      /* ignore invalid base */
    }
  }
  return new URL(pageUrl);
}

function extractSameOriginLinks(html: string, pageUrl: string): string[] {
  const origin = new URL(pageUrl);
  const originHost = origin.hostname.toLowerCase();
  const linkBase = resolvePageBase(pageUrl, html);
  const $ = load(html);
  const found = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href) return;
    const lower = href.toLowerCase();
    if (lower.startsWith("#") || lower.startsWith("javascript:") || lower.startsWith("mailto:") || lower.startsWith("tel:")) return;
    let abs: URL;
    try {
      abs = new URL(href, linkBase);
    } catch {
      return;
    }
    if (!["http:", "https:"].includes(abs.protocol)) return;
    if (abs.hostname.toLowerCase() !== originHost) return;
    const path = abs.pathname.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|cjs|map|pdf|zip|tar|gz|7z|rar|mp4|webm|mp3|wav|woff2?|ttf|eot|otf)$/i.test(path)) return;
    found.add(normalizeFetchUrlString(abs.toString()));
  });
  return [...found];
}

function mergeFetchedPages(pages: Array<{ url: string; title: string; markdown: string }>): string {
  if (pages.length === 1) return pages[0].markdown;
  return pages
    .map((p, i) => `## ${i + 1}. ${p.title}\n\n_Source: ${p.url}_\n\n${p.markdown}`)
    .join("\n\n---\n\n");
}

function extractXmlLocUrls(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc[^>]*>\s*([^<]+?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    let raw = m[1].trim();
    if (raw.startsWith("<![CDATA[")) raw = raw.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "");
    if (raw) out.push(raw);
  }
  return out;
}

function parseRobotsSitemapLines(robotsText: string): string[] {
  const urls: string[] = [];
  for (const line of robotsText.split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap:\s*(.+)\s*$/i);
    if (m) {
      const candidate = m[1].trim();
      try {
        urls.push(normalizeFetchUrlString(new URL(candidate).toString()));
      } catch {
        /* ignore */
      }
    }
  }
  return urls;
}

/** 适用于 User-agent * 的规则（路径前缀匹配；不含 RFC 通配符 `*` / `$` 的完整实现）。 */
type ParsedRobotsStar = {
  disallowPrefixes: string[];
  allowPrefixes: string[];
  crawlDelayMs: number | null;
};

function parseRobotsTxtForStarAgent(robotsText: string): ParsedRobotsStar {
  const disallowOut: string[] = [];
  const allowOut: string[] = [];
  const crawlMs: number[] = [];

  type Block = { agents: string[]; disallow: string[]; allow: string[]; crawlDelaySec: number | null };
  const blocks: Block[] = [];
  let cur: Block | null = null;

  function flush() {
    if (cur && cur.agents.length > 0) blocks.push(cur);
    cur = null;
  }

  for (let rawLine of robotsText.split(/\r?\n/)) {
    const ci = rawLine.indexOf("#");
    if (ci >= 0) rawLine = rawLine.slice(0, ci);
    const line = rawLine.trim();
    if (!line) continue;

    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const val = line.slice(colon + 1).trim();

    if (key === "user-agent") {
      const ua = val.toLowerCase();
      if (!cur) {
        cur = { agents: [ua], disallow: [], allow: [], crawlDelaySec: null };
      } else if (cur.disallow.length === 0 && cur.allow.length === 0 && cur.crawlDelaySec === null) {
        cur.agents.push(ua);
      } else {
        flush();
        cur = { agents: [ua], disallow: [], allow: [], crawlDelaySec: null };
      }
    } else if (!cur) {
      continue;
    } else if (key === "disallow") {
      cur.disallow.push(val);
    } else if (key === "allow") {
      cur.allow.push(val);
    } else if (key === "crawl-delay") {
      const n = Number(val.replace(",", "."));
      if (Number.isFinite(n) && n >= 0) cur.crawlDelaySec = n;
    }
  }
  flush();

  for (const b of blocks) {
    if (!b.agents.some((a) => a.trim() === "*")) continue;
    for (const d of b.disallow) {
      const t = d.trim();
      if (t === "") continue;
      disallowOut.push(t.startsWith("/") ? t : `/${t}`);
    }
    for (const a of b.allow) {
      const t = a.trim();
      if (t === "") continue;
      allowOut.push(t.startsWith("/") ? t : `/${t}`);
    }
    if (b.crawlDelaySec !== null) crawlMs.push(Math.round(b.crawlDelaySec * 1000));
  }

  return {
    disallowPrefixes: disallowOut,
    allowPrefixes: allowOut,
    crawlDelayMs: crawlMs.length ? Math.max(...crawlMs) : null
  };
}

function prefixRobotsMatchLen(pathname: string, prefixRaw: string): number {
  const p = prefixRaw.trim();
  if (!p) return -1;
  const pref = p.startsWith("/") ? p : `/${p}`;
  if (pref === "/") return pathname.startsWith("/") ? 1 : -1;
  if (pathname === pref) return pref.length;
  if (pathname.startsWith(`${pref}/`)) return pref.length;
  return -1;
}

function isAllowedByRobotsPath(pathname: string, rules: ParsedRobotsStar): boolean {
  if (rules.disallowPrefixes.length === 0 && rules.allowPrefixes.length === 0) return true;

  let bestDisallow = -1;
  for (const pat of rules.disallowPrefixes) {
    bestDisallow = Math.max(bestDisallow, prefixRobotsMatchLen(pathname, pat));
  }
  let bestAllow = -1;
  for (const pat of rules.allowPrefixes) {
    bestAllow = Math.max(bestAllow, prefixRobotsMatchLen(pathname, pat));
  }

  if (bestAllow > bestDisallow) return true;
  if (bestDisallow > bestAllow) return false;
  if (bestAllow >= 0 && bestAllow === bestDisallow) return true;
  return true;
}

function isAllowedByRobotsUrl(urlStr: string, rules: ParsedRobotsStar | null): boolean {
  if (!rules) return true;
  let pathname: string;
  try {
    pathname = new URL(urlStr).pathname;
  } catch {
    return false;
  }
  return isAllowedByRobotsPath(pathname, rules);
}

function createRobotsThrottle(crawlDelayMs: number | null) {
  let lastEnd = 0;
  return {
    async beforeFetch() {
      if (!crawlDelayMs || crawlDelayMs <= 0) return;
      const elapsed = Date.now() - lastEnd;
      if (elapsed < crawlDelayMs) await new Promise((r) => setTimeout(r, crawlDelayMs - elapsed));
    },
    afterFetch() {
      lastEnd = Date.now();
    }
  };
}

async function fetchRobotsRulesForOrigin(originRoot: string): Promise<ParsedRobotsStar | null> {
  const txt = await fetchRobotsTxtForOrigin(originRoot);
  if (!txt) return null;
  return parseRobotsTxtForStarAgent(txt);
}

async function fetchBodyBufferLimited(url: string, maxBytes: number, accept: string): Promise<Buffer> {
  await validateSafeUrl(url);
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: 15_000,
    maxRedirects: 3,
    headers: {
      "user-agent": "Model-Plunger/0.1",
      accept
    }
  });
  const buf = Buffer.from(res.data as ArrayBuffer);
  const cl = Number(res.headers["content-length"] ?? 0);
  if (cl > maxBytes) throw new Error("响应体积超限");
  if (buf.length > maxBytes) throw new Error("响应体积超限");
  return buf;
}

async function fetchRobotsTxtForOrigin(originRoot: string): Promise<string | null> {
  const robotsUrl = normalizeFetchUrlString(new URL("/robots.txt", originRoot).toString());
  try {
    const buf = await fetchBodyBufferLimited(robotsUrl, MAX_ROBOTS_TXT_BYTES, "text/plain,*/*");
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

async function fetchSitemapXmlUtf8(url: string): Promise<string> {
  await validateSafeUrl(url);
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: 15_000,
    maxRedirects: 3,
    headers: {
      "user-agent": "Model-Plunger/0.1",
      accept: "application/xml,text/xml,application/gzip,*/*"
    }
  });
  let buf = Buffer.from(res.data as ArrayBuffer);
  const cl = Number(res.headers["content-length"] ?? 0);
  if (cl > MAX_SITEMAP_XML_BYTES) throw new Error("sitemap 体积超限");
  if (buf.length > MAX_SITEMAP_XML_BYTES) throw new Error("sitemap 体积超限");
  const gzEnc = `${res.headers["content-encoding"] ?? ""}`.toLowerCase().includes("gzip");
  const gzUrl = url.toLowerCase().endsWith(".gz");
  if (gzEnc || gzUrl) {
    buf = zlib.gunzipSync(buf);
    if (buf.length > MAX_SITEMAP_XML_BYTES) throw new Error("解压后 sitemap 超限");
  }
  return buf.toString("utf8");
}

function isSitemapIndexXml(xmlHead: string): boolean {
  return /<sitemapindex[\s>]/i.test(xmlHead.slice(0, 8192));
}

function skipLikelyNonDocAsset(pathname: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|cjs|map|pdf|zip|tar|gz|7z|rar|mp4|webm|mp3|wav|woff2?|ttf|eot|otf|xml)$/i.test(
    pathname.toLowerCase()
  );
}

async function discoverUrlsFromSitemaps(
  seedUrl: string,
  maxUrls: number,
  sameOriginOnly: boolean
): Promise<{ urls: string[]; sitemapsFetched: string[]; starRules: ParsedRobotsStar | null }> {
  const seed = new URL(normalizeFetchUrlString(seedUrl));
  const originRoot = `${seed.protocol}//${seed.hostname}`;
  const originHost = seed.hostname.toLowerCase();

  const sitemapQueue: string[] = [];
  const parsedSitemaps = new Set<string>();
  const pageUrls: string[] = [];
  const seenPages = new Set<string>();

  const robotsText = await fetchRobotsTxtForOrigin(originRoot);
  const starRules = robotsText ? parseRobotsTxtForStarAgent(robotsText) : null;
  const throttle = createRobotsThrottle(starRules?.crawlDelayMs ?? null);

  if (robotsText) sitemapQueue.push(...parseRobotsSitemapLines(robotsText));
  if (sitemapQueue.length === 0) {
    try {
      const fallback = normalizeFetchUrlString(new URL("/sitemap.xml", originRoot).toString());
      if (isAllowedByRobotsUrl(fallback, starRules)) sitemapQueue.push(fallback);
    } catch {
      /* ignore */
    }
  }

  while (sitemapQueue.length > 0 && parsedSitemaps.size < MAX_SITEMAP_FILES_PARSED && pageUrls.length < maxUrls) {
    const rawNext = sitemapQueue.shift()!;
    const norm = normalizeFetchUrlString(rawNext);
    if (parsedSitemaps.has(norm)) continue;
    if (!isAllowedByRobotsUrl(norm, starRules)) continue;

    let xml: string;
    try {
      await throttle.beforeFetch();
      try {
        xml = await fetchSitemapXmlUtf8(norm);
      } finally {
        throttle.afterFetch();
      }
      parsedSitemaps.add(norm);
    } catch {
      continue;
    }

    const locs = extractXmlLocUrls(xml);
    const indexFile = isSitemapIndexXml(xml);

    if (indexFile) {
      for (const loc of locs) {
        if (sitemapQueue.length + parsedSitemaps.size > 500) break;
        try {
          const child = normalizeFetchUrlString(new URL(loc).toString());
          await validateSafeUrl(child);
          if (!parsedSitemaps.has(child) && isAllowedByRobotsUrl(child, starRules)) sitemapQueue.push(child);
        } catch {
          /* skip unsafe or invalid */
        }
      }
    } else {
      for (const loc of locs) {
        if (pageUrls.length >= maxUrls) break;
        try {
          const pageNorm = normalizeFetchUrlString(new URL(loc).toString());
          const host = new URL(pageNorm).hostname.toLowerCase();
          if (sameOriginOnly && host !== originHost) continue;
          if (!isAllowedByRobotsUrl(pageNorm, starRules)) continue;
          if (skipLikelyNonDocAsset(new URL(pageNorm).pathname)) continue;
          if (!seenPages.has(pageNorm)) {
            seenPages.add(pageNorm);
            pageUrls.push(pageNorm);
          }
        } catch {
          /* skip */
        }
      }
    }
  }

  return { urls: pageUrls, sitemapsFetched: [...parsedSitemaps], starRules };
}

async function fetchPagesFromUrlList(
  urls: string[],
  maxPages: number,
  starRules: ParsedRobotsStar | null
): Promise<Array<{ url: string; title: string; markdown: string }>> {
  const throttle = createRobotsThrottle(starRules?.crawlDelayMs ?? null);
  const pages: Array<{ url: string; title: string; markdown: string }> = [];
  for (const raw of urls) {
    if (pages.length >= maxPages) break;
    const norm = normalizeFetchUrlString(raw);
    try {
      await validateSafeUrl(norm);
      if (!isAllowedByRobotsUrl(norm, starRules)) continue;
      await throttle.beforeFetch();
      let html: string;
      try {
        html = await fetchHtml(norm);
      } finally {
        throttle.afterFetch();
      }
      const { title, markdown } = htmlToMarkdown(html);
      pages.push({ url: norm, title, markdown });
    } catch {
      /* skip failed pages */
    }
  }
  return pages;
}

async function fetchSameOriginFromSitemap(seedUrl: string, maxPages: number): Promise<{
  pages: Array<{ url: string; title: string; markdown: string }>;
  mergedMarkdown: string;
  sitemapsFetched: string[];
}> {
  const seedNorm = normalizeFetchUrlString(seedUrl);
  const discoverCap = Math.min(2000, Math.max(maxPages * 5, maxPages));
  const { urls, sitemapsFetched, starRules } = await discoverUrlsFromSitemaps(seedNorm, discoverCap, true);

  const seen = new Set<string>();
  const ordered: string[] = [];
  function push(u: string) {
    const n = normalizeFetchUrlString(u);
    if (seen.has(n)) return;
    seen.add(n);
    ordered.push(n);
  }
  push(seedNorm);
  for (const u of urls) push(u);

  const pages = await fetchPagesFromUrlList(ordered, maxPages, starRules);
  if (pages.length === 0) throw new Error("未能通过 Sitemap 抓取到任何页面（起始 URL 可能无效或下载失败）");
  return { pages, mergedMarkdown: mergeFetchedPages(pages), sitemapsFetched };
}

async function fetchHtml(url: string): Promise<string> {
  const res = await axios.get<string>(url, {
    timeout: 15_000,
    maxRedirects: 3,
    responseType: "text",
    headers: {
      "user-agent": "Model-Plunger/0.1",
      accept: "text/html,application/xhtml+xml"
    }
  });
  const contentLength = Number(res.headers["content-length"] ?? 0);
  if (contentLength > MAX_DOC_SIZE) throw new Error("页面内容超过 5MB 限制");
  const html = res.data;
  if (Buffer.byteLength(html, "utf8") > MAX_DOC_SIZE) throw new Error("页面内容超过 5MB 限制");
  return html;
}

function htmlToMarkdown(html: string): { title: string; markdown: string } {
  const $ = load(html);

  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim();
  const twitterTitle = $('meta[name="twitter:title"]').attr("content")?.trim();
  const title =
    $("title").first().text().trim() || ogTitle || twitterTitle || $("h1").first().text().trim() || "Untitled";

  $("script, style, noscript, iframe, svg, template").remove();
  $("link[rel=\"preload\"]").remove();

  const stripSelectors = [
    "nav",
    "footer",
    "aside",
    "header",
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '[role="complementary"]',
    ".sidebar",
    "#sidebar",
    ".advertisement",
    ".adsbygoogle",
    ".cookie-banner",
    ".cookie-consent"
  ];
  for (const sel of stripSelectors) {
    $(sel).remove();
  }

  const containerSelectors = [
    "article",
    '[role="main"]',
    "main",
    '[itemprop="articleBody"]',
    "#main-content",
    "#content-main",
    "#content",
    ".markdown-body",
    ".docs-markdown",
    ".documentation-body",
    ".documentation-content",
    ".doc-content",
    ".theme-doc-markdown",
    ".markdown",
    ".prose"
  ];

  const textScoreHtml = (fragHtml: string) =>
    load(fragHtml).text().replace(/\s+/g, " ").trim().length;

  let bestHtml = "";
  let bestScore = 0;
  for (const sel of containerSelectors) {
    const node = $(sel).first();
    if (!node.length) continue;
    const inner = node.html() ?? "";
    const sc = node.text().replace(/\s+/g, " ").trim().length;
    if (sc > bestScore) {
      bestScore = sc;
      bestHtml = inner;
    }
  }

  const bodyHtml = $("body").html() ?? "";
  const bodyScore = textScoreHtml(bodyHtml);
  const threshold = Math.max(120, Math.min(800, Math.floor(bodyScore * 0.12)));

  let targetHtml = bestScore >= threshold && bestHtml.trim() !== "" ? bestHtml : bodyHtml;
  if (!targetHtml.trim()) targetHtml = $("body").html() ?? "";

  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  td.addRule("preCodeWithLang", {
    filter(node) {
      return node.nodeName === "PRE" && node.firstChild != null && node.firstChild.nodeName === "CODE";
    },
    replacement(_content, node) {
      const codeEl = node.firstChild!;
      const cls = (codeEl as { getAttribute?: (name: string) => string | null }).getAttribute?.("class") ?? "";
      const m = /language-([\w.+-]+)/.exec(cls);
      const lang = m?.[1] ?? "";
      const raw = (codeEl.textContent ?? "").replace(/\u00a0/g, " ");
      return `\n\`\`\`${lang}\n${raw.trimEnd()}\n\`\`\`\n`;
    }
  });

  const markdown = td.turndown(targetHtml).trim();
  return { title, markdown };
}

async function fetchDocAsMarkdown(url: string): Promise<{ title: string; markdown: string }> {
  const norm = normalizeFetchUrlString(url);
  const u = new URL(norm);
  const originRoot = `${u.protocol}//${u.hostname}`;
  const starRules = await fetchRobotsRulesForOrigin(originRoot);
  if (!isAllowedByRobotsUrl(norm, starRules)) {
    throw new Error("robots.txt（User-agent *）禁止抓取该 URL");
  }
  const throttle = createRobotsThrottle(starRules?.crawlDelayMs ?? null);
  await throttle.beforeFetch();
  try {
    const html = await fetchHtml(norm);
    return htmlToMarkdown(html);
  } finally {
    throttle.afterFetch();
  }
}

async function fetchSameOriginRecursive(seedUrl: string, maxPages: number): Promise<{ pages: Array<{ url: string; title: string; markdown: string }>; mergedMarkdown: string }> {
  const seedNorm = normalizeFetchUrlString(seedUrl);
  const seedU = new URL(seedNorm);
  const originRoot = `${seedU.protocol}//${seedU.hostname}`;
  const starRules = await fetchRobotsRulesForOrigin(originRoot);
  if (!isAllowedByRobotsUrl(seedNorm, starRules)) {
    throw new Error("起始 URL 被 robots.txt（User-agent *）禁止抓取");
  }

  const throttle = createRobotsThrottle(starRules?.crawlDelayMs ?? null);
  const queue: string[] = [seedNorm];
  const visited = new Set<string>();
  const pages: Array<{ url: string; title: string; markdown: string }> = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const rawNext = queue.shift()!;
    const norm = normalizeFetchUrlString(rawNext);
    if (visited.has(norm)) continue;
    visited.add(norm);

    let safe: URL;
    try {
      safe = await validateSafeUrl(norm);
    } catch {
      continue;
    }
    const fetchTarget = normalizeFetchUrlString(safe.toString());

    if (!isAllowedByRobotsUrl(fetchTarget, starRules)) continue;

    let html: string;
    try {
      await throttle.beforeFetch();
      try {
        html = await fetchHtml(fetchTarget);
      } finally {
        throttle.afterFetch();
      }
    } catch {
      continue;
    }

    const { title, markdown } = htmlToMarkdown(html);
    pages.push({ url: fetchTarget, title, markdown });

    if (pages.length >= maxPages) break;

    const links = extractSameOriginLinks(html, fetchTarget);
    for (const link of links) {
      const ln = normalizeFetchUrlString(link);
      if (!visited.has(ln) && isAllowedByRobotsUrl(ln, starRules)) queue.push(ln);
    }
  }

  if (pages.length === 0) throw new Error("递归抓取未能获取任何页面（起始 URL 可能无效或全部被跳过）");

  return { pages, mergedMarkdown: mergeFetchedPages(pages) };
}

app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? true
});

app.get("/api/health", async () => ({ ok: true }));

app.get("/api/settings", async () => ({
  ok: true,
  settings: {
    analyzerBaseUrlConfigured: Boolean(process.env.ANALYZER_BASE_URL),
    analyzerApiKeyConfigured: Boolean(process.env.ANALYZER_API_KEY),
    analyzerApiKeyMasked: process.env.ANALYZER_API_KEY
      ? `${process.env.ANALYZER_API_KEY.slice(0, 3)}***${process.env.ANALYZER_API_KEY.slice(-2)}`
      : null,
    analyzerModel: process.env.ANALYZER_MODEL ?? null,
    githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN?.trim())
  }
}));

app.get("/api/integrations/targets", async () => ({
  ok: true,
  targets: INTEGRATION_TARGETS
}));

app.get("/api/integrations/profiles", async () => ({
  ok: true,
  profiles: INTEGRATION_PROFILES
}));

app.post("/api/integrations/render", async (req, reply) => {
  const parsed = integrationRenderBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      message: "集成渲染参数校验失败",
      issues: parsed.error.issues.slice(0, 30)
    });
  }
  try {
    const full = await buildIntegrationRender(prisma, parsed.data);
    return {
      ok: true,
      render: {
        profileId: full.profile.id,
        profileLabel: full.profile.label,
        profileProtocol: full.profile.protocol,
        targetId: full.target.id,
        targetName: full.target.name,
        resolvedBaseUrl: full.resolvedBaseUrl,
        resolvedModelName: full.resolvedModelName,
        authType: full.authType,
        authHeaderName: full.authHeaderName,
        authHeaderTemplate: full.authHeaderTemplate,
        envExample: full.envExample,
        modelNameRule: full.modelNameRule,
        capabilityHints: full.profile.capabilityHints,
        softwareConfigSnippet: full.softwareConfigSnippet,
        curlExample: full.curlExample,
        warnings: full.warnings,
        knownPitfalls: full.knownPitfalls,
        commonErrors: full.commonErrorsMerged,
        suggestedTestTypes: full.suggestedTestTypes.map((t) => ({
          id: t.id,
          label: t.label
        }))
      }
    };
  } catch (error) {
    return reply.code(400).send({ ok: false, message: stringifyErr(error) });
  }
});

app.post("/api/docs/fetch", async (req, reply) => {
  try {
    const parsed = fetchDocSchema.parse(req.body);
    const safeUrl = await validateSafeUrl(parsed.url);
    const seed = normalizeFetchUrlString(safeUrl.toString());

    if (!parsed.recursiveSameOrigin && !parsed.fromSitemap && !parsed.fromGithubReadme && !parsed.fromOpenApi) {
      const doc = await fetchDocAsMarkdown(seed);
      return {
        ok: true,
        doc: {
          url: seed,
          title: doc.title,
          markdown: doc.markdown,
          textLength: doc.markdown.length
        }
      };
    }

    if (parsed.fromOpenApi) {
      const json = await fetchOpenApiJson(seed);
      const conv = openApiSpecToMarkdown(json);
      return {
        ok: true,
        doc: {
          url: seed,
          title: conv.title,
          markdown: conv.markdown,
          textLength: conv.markdown.length,
          openApi: { variant: conv.variant }
        }
      };
    }

    if (parsed.fromGithubReadme) {
      const gh = await fetchGithubRepoReadmeMarkdown(seed);
      return {
        ok: true,
        doc: {
          url: seed,
          title: gh.title,
          markdown: gh.markdown,
          textLength: gh.markdown.length,
          github: { owner: gh.owner, repo: gh.repo }
        }
      };
    }

    if (parsed.fromSitemap) {
      const { pages, mergedMarkdown, sitemapsFetched } = await fetchSameOriginFromSitemap(seed, parsed.maxPages);
      return {
        ok: true,
        doc: {
          url: seed,
          title: pages[0]?.title ?? "Untitled",
          markdown: mergedMarkdown,
          textLength: mergedMarkdown.length,
          crawl: {
            fromSitemap: true,
            fetchedPages: pages.length,
            maxPagesRequested: parsed.maxPages,
            sitemapsFetched,
            pages: pages.map((p) => ({ url: p.url, title: p.title, textLength: p.markdown.length }))
          }
        }
      };
    }

    const { pages, mergedMarkdown } = await fetchSameOriginRecursive(seed, parsed.maxPages);
    return {
      ok: true,
      doc: {
        url: seed,
        title: pages[0]?.title ?? "Untitled",
        markdown: mergedMarkdown,
        textLength: mergedMarkdown.length,
        crawl: {
          sameOriginRecursive: true,
          fetchedPages: pages.length,
          maxPagesRequested: parsed.maxPages,
          pages: pages.map((p) => ({ url: p.url, title: p.title, textLength: p.markdown.length }))
        }
      }
    };
  } catch (error) {
    const msg = stringifyErr(error);
    return reply.code(400).send({ ok: false, message: msg, hints: hintsForDocFetchFailure(msg) });
  }
});

app.post("/api/docs/sitemap", async (req, reply) => {
  try {
    const parsed = sitemapDiscoverSchema.parse(req.body);
    const safeUrl = await validateSafeUrl(parsed.url);
    const seed = normalizeFetchUrlString(safeUrl.toString());
    const { urls, sitemapsFetched } = await discoverUrlsFromSitemaps(seed, parsed.maxUrls, parsed.sameOriginOnly);
    return { ok: true, urls, sitemapsFetched };
  } catch (error) {
    const msg = stringifyErr(error);
    return reply.code(400).send({ ok: false, message: msg, hints: hintsForDocFetchFailure(msg) });
  }
});

app.post("/api/docs/check-updates", async (req, reply) => {
  try {
    const parsed = docCheckUpdatesSchema.parse(req.body ?? {});
    const checkedAt = new Date().toISOString();
    const docs = await prisma.providerDoc.findMany({
      where: parsed.providerIds?.length ? { providerId: { in: parsed.providerIds } } : undefined,
      include: { provider: { select: { name: true } } },
      orderBy: [{ providerId: "asc" }, { url: "asc" }]
    });

    const results: Array<{
      providerId: string;
      providerName: string;
      docId: string;
      url: string;
      storedHash: string;
      liveHash: string | null;
      changed: boolean | null;
      error?: string;
    }> = [];

    let changed = 0;
    let unchanged = 0;
    let errors = 0;

    const originRobots = new Map<
      string,
      { rules: ParsedRobotsStar | null; throttle: ReturnType<typeof createRobotsThrottle> }
    >();

    async function robotsCtxFor(normUrl: string) {
      const u = new URL(normUrl);
      const originRoot = `${u.protocol}//${u.hostname}`;
      let entry = originRobots.get(originRoot);
      if (!entry) {
        const rules = await fetchRobotsRulesForOrigin(originRoot);
        entry = { rules, throttle: createRobotsThrottle(rules?.crawlDelayMs ?? null) };
        originRobots.set(originRoot, entry);
      }
      return entry;
    }

    for (const d of docs) {
      try {
        const safe = await validateSafeUrl(d.url);
        const norm = normalizeFetchUrlString(safe.toString());
        const ctx = await robotsCtxFor(norm);
        if (!isAllowedByRobotsUrl(norm, ctx.rules)) {
          errors++;
          results.push({
            providerId: d.providerId,
            providerName: d.provider.name,
            docId: d.id,
            url: norm,
            storedHash: d.contentHash,
            liveHash: null,
            changed: null,
            error: "robots.txt（User-agent *）禁止抓取该 URL"
          });
          continue;
        }
        await ctx.throttle.beforeFetch();
        let html: string;
        try {
          html = await fetchHtml(norm);
        } finally {
          ctx.throttle.afterFetch();
        }
        const { markdown } = htmlToMarkdown(html);
        const liveHash = createHash("sha256").update(markdown).digest("hex");
        const isChanged = liveHash !== d.contentHash;
        if (isChanged) changed++;
        else unchanged++;
        results.push({
          providerId: d.providerId,
          providerName: d.provider.name,
          docId: d.id,
          url: norm,
          storedHash: d.contentHash,
          liveHash,
          changed: isChanged
        });
      } catch (err) {
        errors++;
        results.push({
          providerId: d.providerId,
          providerName: d.provider.name,
          docId: d.id,
          url: d.url,
          storedHash: d.contentHash,
          liveHash: null,
          changed: null,
          error: stringifyErr(err)
        });
      }
    }

    return {
      ok: true,
      checkedAt,
      summary: { total: docs.length, changed, unchanged, errors },
      results
    };
  } catch (error) {
    return reply.code(400).send({ ok: false, message: stringifyErr(error) });
  }
});

app.post("/api/docs/diff-versions", async (req, reply) => {
  try {
    const parsed = docDiffVersionsSchema.parse(req.body ?? {});
    const doc = await prisma.providerDoc.findUnique({
      where: { id: parsed.docId },
      include: { provider: { select: { name: true } } }
    });
    if (!doc) return reply.code(404).send({ ok: false, message: "未找到文档记录" });

    const safe = await validateSafeUrl(doc.url);
    const norm = normalizeFetchUrlString(safe.toString());
    const u = new URL(norm);
    const originRoot = `${u.protocol}//${u.hostname}`;
    const starRules = await fetchRobotsRulesForOrigin(originRoot);
    if (!isAllowedByRobotsUrl(norm, starRules)) {
      return reply.code(400).send({
        ok: false,
        message: "robots.txt（User-agent *）禁止抓取该 URL，无法生成对比",
        hints: hintsForDocFetchFailure("robots.txt（User-agent *）禁止抓取该 URL")
      });
    }

    const throttle = createRobotsThrottle(starRules?.crawlDelayMs ?? null);
    await throttle.beforeFetch();
    let html: string;
    try {
      html = await fetchHtml(norm);
    } finally {
      throttle.afterFetch();
    }

    const { markdown: liveMarkdown } = htmlToMarkdown(html);
    const liveHash = createHash("sha256").update(liveMarkdown).digest("hex");
    const identical = liveHash === doc.contentHash;

    let storedNorm = doc.contentMarkdown.replace(/\r\n/g, "\n");
    let liveNorm = liveMarkdown.replace(/\r\n/g, "\n");
    let markdownTruncated = false;
    if (storedNorm.length > MAX_MARKDOWN_SIDE_CHARS_FOR_DIFF || liveNorm.length > MAX_MARKDOWN_SIDE_CHARS_FOR_DIFF) {
      markdownTruncated = true;
      if (storedNorm.length > MAX_MARKDOWN_SIDE_CHARS_FOR_DIFF) {
        storedNorm = `${storedNorm.slice(0, MAX_MARKDOWN_SIDE_CHARS_FOR_DIFF)}\n\n…（入库 Markdown 过长，已截断参与对比）\n`;
      }
      if (liveNorm.length > MAX_MARKDOWN_SIDE_CHARS_FOR_DIFF) {
        liveNorm = `${liveNorm.slice(0, MAX_MARKDOWN_SIDE_CHARS_FOR_DIFF)}\n\n…（实时 Markdown 过长，已截断参与对比）\n`;
      }
    }

    const patch = createTwoFilesPatch("stored.md", "live.md", storedNorm, liveNorm, "", "", { context: 4 });
    const truncated = patch.length > MAX_UNIFIED_DIFF_CHARS;
    const unifiedDiff = truncated ? `${patch.slice(0, MAX_UNIFIED_DIFF_CHARS)}\n\n…（unified diff 输出过长已截断）\n` : patch;

    return {
      ok: true,
      docId: doc.id,
      providerId: doc.providerId,
      providerName: doc.provider.name,
      url: norm,
      title: doc.title,
      storedHash: doc.contentHash,
      liveHash,
      identical,
      markdownTruncated,
      unifiedDiff,
      unifiedDiffTruncated: truncated
    };
  } catch (error) {
    const msg = stringifyErr(error);
    return reply.code(400).send({ ok: false, message: msg, hints: hintsForDocFetchFailure(msg) });
  }
});

app.post("/api/docs/analyze", async (req, reply) => {
  try {
    const parsed = analyzeSchema.parse(req.body);
    if (!process.env.ANALYZER_BASE_URL || !process.env.ANALYZER_API_KEY || !process.env.ANALYZER_MODEL) {
      return reply.code(400).send({
        ok: false,
        message: "分析模型配置不完整，请检查 .env",
        hints: [
          "请在项目根目录 .env 中配置 ANALYZER_BASE_URL、ANALYZER_API_KEY、ANALYZER_MODEL（网关须提供 OpenAI 兼容 /chat/completions）。"
        ]
      });
    }
    const truncated = parsed.markdown.slice(0, MAX_ANALYZE_CHARS);
    const endpoint = buildEndpointUrl(process.env.ANALYZER_BASE_URL, "/chat/completions");
    const aiRes = await axios.post(
      endpoint,
      {
        model: process.env.ANALYZER_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: analyzerPrompt },
          {
            role: "user",
            content: `文档 URL: ${parsed.url}\n平台名称(可能为空): ${parsed.providerName ?? "unknown"}\n\n文档内容:\n${truncated}`
          }
        ]
      },
      {
        timeout: 30_000,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.ANALYZER_API_KEY}`
        }
      }
    );
    const payload = aiRes.data;
    const content = payload?.choices?.[0]?.message?.content ?? "";
    const repaired = repairParseAiJsonContent(String(content));
    if (!repaired.ok) {
      return reply.code(422).send({
        ok: false,
        message: repaired.error,
        error: repaired.error,
        repairSteps: repaired.repairSteps,
        rawSummary: repaired.snippet,
        hints: hintsForAnalyzeRepairFailure(repaired.repairSteps, repaired.snippet ?? "")
      });
    }
    const normalized = normalizeAnalysisStructure(repaired.value);
    const safe = analysisSchema.safeParse(normalized);
    if (!safe.success) {
      const issues = safe.error.issues.map((i) => ({ path: i.path.join("."), message: i.message, code: i.code }));
      return reply.code(422).send({
        ok: false,
        message: "AI 输出结构校验失败（已尝试 JSON 修复与字段规整）",
        issues,
        repairSteps: [...repaired.repairSteps, "normalize_structure"],
        rawSummary: String(content).trim().slice(0, 1500),
        hints: hintsForAnalyzeStructureIssues([...repaired.repairSteps, "normalize_structure"], issues, String(content))
      });
    }
    return {
      ok: true,
      analysis: safe.data,
      repairSteps: [...repaired.repairSteps, "normalize_structure", "zod_validated"]
    };
  } catch (error) {
    const msg = stringifyErr(error);
    return reply.code(400).send({ ok: false, message: msg, hints: hintsForAnalyzerTransport(msg) });
  }
});

app.post("/api/providers", async (req, reply) => {
  try {
    const parsed = saveProviderSchema.parse(req.body);
    const analysisInput =
      typeof parsed.analysis === "object" && parsed.analysis !== null && !Array.isArray(parsed.analysis)
        ? normalizeAnalysisStructure(parsed.analysis as Record<string, unknown>)
        : parsed.analysis;
    const analysis = analysisSchema.parse(analysisInput);
    const name = analysis.provider.name ?? "Unknown Provider";
    const slug = await allocateUniqueSlug(toSlug(name) || `provider-${Date.now()}`);
    const provider = await prisma.provider.create({
      data: {
        name,
        slug,
        description: analysis.provider.description,
        docsUrl: parsed.sourceUrl,
        officialWebsite: analysis.provider.officialWebsite,
        isOpenAICompatible: analysis.compatibility.isOpenAICompatible,
        compatibleLevel: analysis.compatibility.compatibleLevel,
        baseUrl: analysis.endpoints.baseUrl,
        authType: analysis.auth.type,
        authHeaderName: analysis.auth.headerName,
        authHeaderTemplate: analysis.auth.headerValueTemplate,
        chatCompletionsPath: analysis.endpoints.chatCompletions,
        embeddingsPath: analysis.endpoints.embeddings,
        modelsPath: analysis.endpoints.models,
        rawAnalysisJson: JSON.stringify(analysis),
        docs: {
          create: {
            url: parsed.sourceUrl,
            title: parsed.sourceTitle ?? name,
            contentMarkdown: parsed.sourceMarkdown,
            contentHash: createHash("sha256").update(parsed.sourceMarkdown).digest("hex")
          }
        },
        models: {
          create: analysis.models
            .filter((m) => m.name)
            .map((m) => ({
              name: m.name ?? "unknown",
              type: m.type,
              contextWindow: m.contextWindow,
              maxOutputTokens: m.maxOutputTokens,
              supportsStreaming: m.supportsStreaming,
              supportsVision: m.supportsVision,
              supportsTools: m.supportsTools,
              supportsJsonMode: m.supportsJsonMode,
              notes: m.notes
            }))
        },
        codeExamples: {
          create: [
            { language: "curl", code: analysis.codeExamples.curl ?? "" },
            { language: "python", code: analysis.codeExamples.python ?? "" },
            { language: "javascript", code: analysis.codeExamples.javascript ?? "" }
          ].filter((x) => x.code)
        },
        commonErrors: {
          create: analysis.commonErrors
            .filter((e) => e.error)
            .map((e) => ({ error: e.error ?? "unknown", reason: e.reason, solution: e.solution }))
        }
      }
    });
    return { ok: true, providerId: provider.id };
  } catch (error) {
    return reply.code(400).send({ ok: false, message: stringifyErr(error) });
  }
});

app.get("/api/providers", async (req) => {
  const query = z.object({ keyword: z.string().optional() }).parse(req.query);
  const list = await prisma.provider.findMany({
    where: query.keyword ? { name: { contains: query.keyword } } : undefined,
    include: { models: true, _count: { select: { models: true } } },
    orderBy: { updatedAt: "desc" }
  });
  return { ok: true, providers: list };
});

app.get("/api/providers/:id", async (req, reply) => {
  const params = z.object({ id: z.string() }).parse(req.params);
  const provider = await prisma.provider.findUnique({
    where: { id: params.id },
    include: { models: true, docs: true, codeExamples: true, commonErrors: true }
  });
  if (!provider) return reply.code(404).send({ ok: false, message: "Provider not found" });
  return { ok: true, provider };
});

app.delete("/api/providers/:id", async (req, reply) => {
  const params = z.object({ id: z.string() }).parse(req.params);
  await prisma.provider.delete({ where: { id: params.id } });
  return reply.send({ ok: true });
});

/** 导出知识库快照（不含 TestRecord）。 */
app.get("/api/knowledge/export", async () => {
  const rows = await prisma.provider.findMany({
    include: { models: true, docs: true, codeExamples: true, commonErrors: true },
    orderBy: { updatedAt: "desc" }
  });
  const providers = rows.map((p) => serializeProviderForExport(p));
  return {
    ok: true,
    formatVersion: KNOWLEDGE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    providerCount: providers.length,
    providers
  };
});

/** 导入知识库：`merge` 保留现有条目并追加（slug 冲突时自动变体）；`replace` 先清空全部 Provider 后再导入（单事务）。 */
app.post<{ Body: unknown }>(
  "/api/knowledge/import",
  { bodyLimit: 15 * 1024 * 1024 },
  async (req, reply) => {
    try {
      const parsed = knowledgeImportBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "导入格式校验失败（需 formatVersion = 1 与 providers[]）",
          issues: parsed.error.issues.slice(0, 40)
        });
      }
      const { providers, mode } = parsed.data;
      if (providers.length === 0) {
        return { ok: true, imported: 0, failed: 0, errors: [], message: "providers 为空" };
      }

      if (mode === "replace") {
        await prisma.$transaction(async (tx) => {
          await tx.provider.deleteMany({});
          for (const ep of providers) {
            const slug = await allocateUniqueSlug(ep.slug, tx);
            await createProviderFromExport(ep, slug, tx);
          }
        });
        return { ok: true, imported: providers.length, failed: 0, mode: "replace", errors: [] };
      }

      const errors: string[] = [];
      let imported = 0;
      for (let i = 0; i < providers.length; i++) {
        try {
          const ep = providers[i];
          const slug = await allocateUniqueSlug(ep.slug);
          await createProviderFromExport(ep, slug);
          imported++;
        } catch (e) {
          errors.push(`条目 #${i + 1} (${providers[i]?.name ?? "?"}): ${stringifyErr(e)}`);
        }
      }
      return {
        ok: true,
        imported,
        failed: providers.length - imported,
        mode: "merge",
        errors: errors.slice(0, 50)
      };
    } catch (error) {
      return reply.code(400).send({ ok: false, message: stringifyErr(error) });
    }
  }
);

app.post("/api/check/test", async (req, reply) => {
  const started = Date.now();
  let httpStatus: number | undefined;
  let recordTestType = "chat";
  try {
    const parsed = testSchema.parse(req.body);
    recordTestType = parsed.testType;
    const provider = parsed.providerId
      ? await prisma.provider.findUnique({ where: { id: parsed.providerId } })
      : null;

    if (parsed.testType === "ollama") {
      const ollamaRoot = ollamaServerRootUrl(parsed.baseUrl);
      let native: { version: string; modelNames: string[] };
      try {
        native = await probeOllamaNative(ollamaRoot, parsed.timeoutMs);
      } catch (probeErr) {
        const latencyMs = Date.now() - started;
        const diagnosis = diagnoseError(undefined, "", stringifyErr(probeErr));
        await prisma.testRecord.create({
          data: {
            providerId: parsed.providerId,
            providerName: provider?.name ?? "Manual Test",
            baseUrlMasked: maskBaseUrl(parsed.baseUrl),
            modelName: parsed.model,
            testType: "ollama",
            success: false,
            httpStatus: null,
            latencyMs,
            errorType: diagnosis.type,
            reason: diagnosis.reason,
            suggestion: `${diagnosis.suggestion}。请确认 baseUrl 指向 Ollama 服务（常见 http://127.0.0.1:11434 或 …/v1）。`
          }
        });
        return reply.code(400).send({
          ok: false,
          result: {
            success: false,
            latencyMs,
            errorMessage: stringifyErr(probeErr),
            diagnosis,
            ollama: { detected: false }
          }
        });
      }

      const endpointByProvider = provider?.chatCompletionsPath;
      const endpoint = buildEndpointUrl(parsed.baseUrl, endpointByProvider);
      const urlHints = detectLikelyBaseUrlMistake(parsed.baseUrl, endpoint);
      const quickFixes = baseUrlFixCandidates(parsed.baseUrl);
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (parsed.apiKey.trim()) headers.authorization = `Bearer ${parsed.apiKey}`;

      const modelToUse = parsed.model?.trim() || native.modelNames[0] || "llama3";
      const chatPayload = {
        model: modelToUse,
        messages: [{ role: "user", content: "Hi" }],
        temperature: 0,
        max_tokens: parsed.maxTokens
      };

      let testRes = await axios.post(endpoint, chatPayload, {
        headers,
        timeout: parsed.timeoutMs,
        validateStatus: () => true
      });
      httpStatus = testRes.status;
      let success = httpStatus >= 200 && httpStatus <= 299;

      if (!success && !endpointByProvider) {
        try {
          const fallbackEndpoint = alternateChatEndpoint(parsed.baseUrl);
          const fallbackRes = await axios.post(fallbackEndpoint, chatPayload, {
            headers,
            timeout: parsed.timeoutMs,
            validateStatus: () => true
          });
          if (fallbackRes.status >= 200 && fallbackRes.status <= 299) {
            testRes = fallbackRes;
            httpStatus = fallbackRes.status;
            success = true;
          }
        } catch {
          /* ignore */
        }
      }

      const text = typeof testRes.data === "string" ? testRes.data : JSON.stringify(testRes.data);
      const latencyMs = Date.now() - started;
      const diagnosis = diagnoseError(httpStatus, text, undefined, urlHints, quickFixes);
      const ollamaParsed = (() => {
        try {
          return JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
        } catch {
          return null;
        }
      })();
      const usageSnap = stringifyUsageSnapshot(ollamaParsed?.usage);
      await prisma.testRecord.create({
        data: {
          providerId: parsed.providerId,
          providerName: provider?.name ?? "Manual Test",
          baseUrlMasked: maskBaseUrl(parsed.baseUrl),
          modelName: modelToUse,
          testType: "ollama",
          success,
          httpStatus,
          latencyMs,
          usageSnapshot: usageSnap,
          errorType: diagnosis.type,
          reason: diagnosis.reason,
          suggestion: success
            ? diagnosis.suggestion
            : `${diagnosis.suggestion}。原生接口已识别为 Ollama ${native.version}；若 chat 失败请确认已 ollama pull 对应模型。`
        }
      });

      const parsedBody = ollamaParsed;

      return reply.code(success ? 200 : 400).send({
        ok: success,
        result: {
          success,
          httpStatus,
          latencyMs,
          content: success ? (parsedBody?.choices?.[0]?.message?.content ?? "OK") : undefined,
          usage: parsedBody?.usage,
          errorMessage: success ? undefined : text.slice(0, 500),
          diagnosis,
          ollama: {
            detected: true,
            version: native.version,
            serverRoot: ollamaRoot,
            models: native.modelNames.slice(0, 40)
          }
        }
      });
    }

    if (parsed.testType === "gemini") {
      const modelToUse = parsed.model?.trim() || "gemini-2.0-flash";
      const endpoint = geminiGenerateContentEndpoint(parsed.baseUrl, modelToUse);
      await validateSafeUrl(endpoint);

      const geminiBody = {
        contents: [{ parts: [{ text: "Hi" }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: parsed.maxTokens
        }
      };

      const testRes = await axios.post(endpoint, geminiBody, {
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": parsed.apiKey.trim()
        },
        timeout: parsed.timeoutMs,
        validateStatus: () => true
      });

      httpStatus = testRes.status;
      const text = typeof testRes.data === "string" ? testRes.data : JSON.stringify(testRes.data);
      const latencyMs = Date.now() - started;
      const diagnosis = diagnoseError(httpStatus, text, undefined, [], [
        {
          id: "gemini-default-root",
          label: "改成 Gemini 默认根地址",
          description: "Gemini REST 通常使用 v1beta 根地址。",
          patch: { baseUrl: "https://generativelanguage.googleapis.com/v1beta", testType: "gemini" }
        }
      ]);
      const success = httpStatus >= 200 && httpStatus <= 299;
      const gemUsage = stringifyUsageSnapshot(extractGeminiUsageMetadata(testRes.data));

      await prisma.testRecord.create({
        data: {
          providerId: parsed.providerId,
          providerName: provider?.name ?? "Manual Test",
          baseUrlMasked: maskBaseUrl(parsed.baseUrl),
          modelName: modelToUse,
          testType: "gemini",
          success,
          httpStatus,
          latencyMs,
          usageSnapshot: gemUsage,
          errorType: diagnosis.type,
          reason: diagnosis.reason,
          suggestion: success
            ? diagnosis.suggestion
            : `${diagnosis.suggestion}。请确认 baseUrl 为 Gemini REST 根（默认 https://generativelanguage.googleapis.com/v1beta）、模型 id 正确且 API Key 有效。`
        }
      });

      const replyText = success ? extractGeminiText(testRes.data) : undefined;
      const usageObj = extractGeminiUsageMetadata(testRes.data);

      return reply.code(success ? 200 : 400).send({
        ok: success,
        result: {
          success,
          httpStatus,
          latencyMs,
          content: success ? (replyText ?? "OK") : undefined,
          usage: usageObj,
          errorMessage: success ? undefined : text.slice(0, 500),
          diagnosis,
          gemini: { model: modelToUse }
        }
      });
    }

    const isOpenAiChatProbe =
      parsed.testType === "chat" || parsed.testType === "chat-min" || parsed.testType === "code-min" || parsed.testType === "json-min";
    const endpointByProvider = isOpenAiChatProbe ? provider?.chatCompletionsPath : provider?.modelsPath;
    const endpoint = parsed.testType === "models" && !endpointByProvider ? buildModelsUrl(parsed.baseUrl) : buildEndpointUrl(parsed.baseUrl, endpointByProvider);
    const urlHints = detectLikelyBaseUrlMistake(parsed.baseUrl, endpoint);
    const quickFixes = [
      ...baseUrlFixCandidates(parsed.baseUrl),
      ...(provider?.baseUrl && provider.baseUrl !== parsed.baseUrl
        ? [{
            id: "use-knowledge-base-url",
            label: "恢复知识库 Base URL",
            description: "使用该平台入库时分析出的 Base URL。",
            patch: { baseUrl: provider.baseUrl }
          } satisfies QuickFix]
        : [])
    ];
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${parsed.apiKey.trim()}`
    };
    const modelFallback = parsed.model ?? "gpt-3.5-turbo";
    const body =
      parsed.testType === "models"
        ? undefined
        : JSON.stringify(
            getOpenAiCompatibleChatPayload(
              parsed.testType as "chat" | "chat-min" | "code-min" | "json-min",
              modelFallback,
              parsed.maxTokens
            )
          );

    const testRes = await axios.request({
      method: parsed.testType === "models" ? "GET" : "POST",
      url: endpoint,
      headers,
      data: body ? JSON.parse(body) : undefined,
      timeout: parsed.timeoutMs,
      validateStatus: () => true
    });
    httpStatus = testRes.status;
    const text = typeof testRes.data === "string" ? testRes.data : JSON.stringify(testRes.data);
    const latencyMs = Date.now() - started;
    const modelFixes: QuickFix[] = [];
    if (provider?.id) {
      const firstModel = await prisma.providerModel.findFirst({ where: { providerId: provider.id }, orderBy: { createdAt: "asc" } });
      if (firstModel?.name && firstModel.name !== parsed.model) {
        modelFixes.push({
          id: "use-first-known-model",
          label: "换成知识库模型名",
          description: `使用已保存模型：${firstModel.name}`,
          patch: { model: firstModel.name }
        });
      }
    }
    const diagnosis = diagnoseError(httpStatus, text, undefined, urlHints, [...quickFixes, ...modelFixes]);
    const success = httpStatus >= 200 && httpStatus <= 299;
    const modelStored = parsed.testType === "models" ? parsed.model ?? null : modelFallback;
    let parsedForUsage: { usage?: unknown } | null = null;
    try {
      parsedForUsage = JSON.parse(text) as { usage?: unknown };
    } catch {
      parsedForUsage = null;
    }
    const usageSnapMain = stringifyUsageSnapshot(parsedForUsage?.usage);

    await prisma.testRecord.create({
      data: {
        providerId: parsed.providerId,
        providerName: provider?.name ?? "Manual Test",
        baseUrlMasked: maskBaseUrl(parsed.baseUrl),
        modelName: modelStored,
        testType: parsed.testType,
        success,
        httpStatus,
        latencyMs,
        usageSnapshot: usageSnapMain,
        errorType: diagnosis.type,
        reason: diagnosis.reason,
        suggestion: success
          ? diagnosis.suggestion
          : `${diagnosis.suggestion} 如果仍是 404，尝试把 Base URL 改成到 /v1 结束，不要把完整 /chat/completions 填进 Base URL，并检查平台文档是否要求特殊 endpoint。`
      }
    });
    if (!success && isOpenAiChatProbe && !endpointByProvider) {
      try {
        const fallbackEndpoint = alternateChatEndpoint(parsed.baseUrl);
        const fallbackRes = await axios.post(fallbackEndpoint, body ? JSON.parse(body) : undefined, {
          headers,
          timeout: parsed.timeoutMs,
          validateStatus: () => true
        });
        if (fallbackRes.status >= 200 && fallbackRes.status <= 299) {
          return {
            ok: true,
            result: {
              success: true,
              httpStatus: fallbackRes.status,
              latencyMs: Date.now() - started,
              content: "Fallback endpoint succeeded",
              diagnosis: { type: "SUCCESS", reason: "连接成功", suggestion: "默认路径失败，但备用路径可用" }
            }
          };
        }
      } catch {
        // Ignore fallback failure.
      }
    }
    const parsedBody = (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })();
    return reply.code(success ? 200 : 400).send({
      ok: success,
      result: {
        success,
        httpStatus,
        latencyMs,
        content: success ? (parsedBody?.choices?.[0]?.message?.content ?? "OK") : undefined,
        usage: parsedBody?.usage,
        errorMessage: success ? undefined : text.slice(0, 500),
        diagnosis
      }
    });
  } catch (error) {
    const latencyMs = Date.now() - started;
    const errMsg = stringifyErr(error);
    const diagnosis = diagnoseError(httpStatus, "", errMsg);
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        ok: false,
        result: {
          success: false,
          httpStatus,
          latencyMs,
          errorMessage: errMsg,
          diagnosis
        }
      });
    }
    await prisma.testRecord.create({
      data: {
        providerName: "Manual Test",
        baseUrlMasked: "invalid",
        testType: recordTestType,
        success: false,
        latencyMs,
        errorType: diagnosis.type,
        reason: diagnosis.reason,
        suggestion: diagnosis.suggestion
      }
    });
    return reply.code(400).send({
      ok: false,
      result: {
        success: false,
        httpStatus,
        latencyMs,
        errorMessage: errMsg,
        diagnosis
      }
    });
  }
});

app.get("/api/test-records", async () => {
  const records = await prisma.testRecord.findMany({ orderBy: { createdAt: "desc" } });
  return { ok: true, records };
});

app.delete("/api/test-records/:id", async (req) => {
  const params = z.object({ id: z.string() }).parse(req.params);
  await prisma.testRecord.delete({ where: { id: params.id } });
  return { ok: true };
});

app.get("/api/stats", async () => {
  const [providerCount, docCount, testCount, last] = await Promise.all([
    prisma.provider.count(),
    prisma.providerDoc.count(),
    prisma.testRecord.count(),
    prisma.testRecord.findFirst({ orderBy: { createdAt: "desc" } })
  ]);
  return {
    ok: true,
    stats: {
      providerCount,
      analyzedDocCount: docCount,
      testCount,
      lastTestResult: last
        ? {
            success: last.success,
            providerName: last.providerName,
            createdAt: last.createdAt
          }
        : null
    }
  };
});

export { app, prisma };

if (process.env.VITEST !== "true") {
  const port = Number(process.env.PORT ?? 8080);
  app.listen({ port, host: "0.0.0.0" }).then(() => {
    app.log.info(`API running at http://localhost:${port}`);
  });
}
