/**
 * 将 LLM 返回的近似 JSON / 混入文本 / 冗余包裹 尽量解析并规整为可被 Zod 接受的结构。
 * 不涉及业务语义推断，只做机械修复与兜底字段。
 */

const COMPAT_LEVEL = new Set(["full", "partial", "no", "unknown"]);
const AUTH_TYPE = new Set(["bearer", "x-api-key", "query-key", "basic", "custom", "unknown"]);
const MODEL_TYPE = new Set(["chat", "reasoning", "embedding", "vision", "image", "audio", "rerank", "unknown"]);
const CLIENT_PROVIDER_TYPE = new Set(["OpenAI Compatible", "OpenAI", "Anthropic", "Gemini", "Ollama", "Custom", "Unknown"]);

/** 移除首尾 markdown 代码围栏（可多轮）。 */
export function stripMarkdownFenceLoose(raw: string): string {
  let s = raw.trim();
  let guard = 0;
  while (s.startsWith("```") && guard++ < 5) {
    s = s.replace(/^```(?:json)?\s*/i, "");
    const end = s.lastIndexOf("```");
    if (end >= 0) s = s.slice(0, end).trim();
    else break;
  }
  return s.trim();
}

/** 截取第一个括号平衡的 JSON 对象子串（简单字符串逃逸处理）。 */
export function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === "\"") inString = false;
      continue;
    }
    if (c === "\"") {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

/** 删除对象 / 数组中的尾随逗号（不处理字符串内含 `,]` 的边缘情况）。 */
export function stripTrailingCommas(jsonLike: string): string {
  return jsonLike.replace(/,\s*(?=[}\]])/g, "");
}

export function unwrapAnalysisEnvelope(raw: Record<string, unknown>): Record<string, unknown> {
  const hasProvider = (o: Record<string, unknown>) => typeof o.provider === "object" && o.provider !== null;
  if (hasProvider(raw)) return raw;
  const keys = ["analysis", "result", "data", "parsed"];
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "object" && v !== null && !Array.isArray(v) && hasProvider(v as Record<string, unknown>)) {
      return v as Record<string, unknown>;
    }
  }
  return raw;
}

function toNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function toNullableBool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "yes" || s === "1") return true;
    if (s === "false" || s === "no" || s === "0") return false;
    if (s === "" || s === "null" || s === "unknown") return null;
  }
  return null;
}

function toNullableInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = parseInt(v.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asRecord(o: unknown): Record<string, unknown> | undefined {
  if (typeof o === "object" && o !== null && !Array.isArray(o)) return o as Record<string, unknown>;
  return undefined;
}

function ensureRecordHeaders(v: unknown): Record<string, unknown> {
  const r = asRecord(v);
  return r ?? {};
}

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function buildFullUrl(base: string | null, endpoint: string | null): string | null {
  if (!base && !endpoint) return null;
  if (endpoint && /^https?:\/\//i.test(endpoint)) return endpoint;
  if (!base) return endpoint;
  const cleanBase = base.replace(/\/+$/g, "");
  if (!endpoint) {
    return /\/chat\/completions$/i.test(cleanBase) ? cleanBase : `${cleanBase}/chat/completions`;
  }
  const ep = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  if (cleanBase.endsWith("/v1") && ep.startsWith("/v1/")) return `${cleanBase}${ep.slice(3)}`;
  return `${cleanBase}${ep}`;
}

function normalizeClientGuideItem(raw: unknown, fallback: { provider: string | null; baseUrl: string | null; model: string | null }) {
  const r = asRecord(raw) ?? {};
  return {
    provider: toNullableString(r.provider) ?? fallback.provider,
    baseUrl: toNullableString(r.baseUrl) ?? fallback.baseUrl,
    apiKey: toNullableString(r.apiKey) ?? "YOUR_API_KEY",
    model: toNullableString(r.model) ?? fallback.model,
    notes: toStringArray(r.notes)
  };
}

/**
 * 规整为与设计 schema 对齐的对象（再给 Zod 校验）。
 */
export function normalizeAnalysisStructure(input: Record<string, unknown>): Record<string, unknown> {
  const src = input;
  const compRaw = src.compatibility;
  const comp = asRecord(compRaw) ?? {};
  const lvl = String(comp.compatibleLevel ?? "");
  const compatibleLevel = COMPAT_LEVEL.has(lvl) ? lvl : "unknown";

  const authRaw = src.auth;
  const authObj = asRecord(authRaw) ?? {};
  const at = String(authObj.type ?? "unknown").toLowerCase();
  const authType = AUTH_TYPE.has(at) ? at : "unknown";

  const modelRows = Array.isArray(src.models) ? src.models : [];
  const models = modelRows.filter((x) => typeof x === "object" && x !== null).map((raw) => {
    const m = raw as Record<string, unknown>;
    const mt = String(m.type ?? "unknown").toLowerCase();
    const type = MODEL_TYPE.has(mt) ? mt : "unknown";
    return {
      name: toNullableString(m.name),
      type,
      contextWindow: toNullableInt(m.contextWindow),
      maxOutputTokens: toNullableInt(m.maxOutputTokens),
      supportsStreaming: toNullableBool(m.supportsStreaming),
      supportsVision: toNullableBool(m.supportsVision),
      supportsTools: toNullableBool(m.supportsTools),
      supportsJsonMode: toNullableBool(m.supportsJsonMode),
      notes: toNullableString(m.notes)
    };
  });

  const prov = asRecord(src.provider) ?? {};
  const endpoints = asRecord(src.endpoints) ?? {};
  const minReq = asRecord(src.minimalRequests) ?? {};
  const chat = asRecord(minReq.chat) ?? {};
  const ml = asRecord(minReq.modelsList) ?? {};
  const codeEx = asRecord(src.codeExamples) ?? {};
  const limits = asRecord(src.limits) ?? {};
  const metaRaw = asRecord(src.analysisMeta) ?? {};
  const clientRaw = asRecord(src.clientConfigGuide) ?? {};

  const commonErrorsRaw = Array.isArray(src.commonErrors) ? src.commonErrors : [];
  const commonErrors = commonErrorsRaw
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null && !Array.isArray(e))
    .map((e) => ({
      error: toNullableString(e.error),
      reason: toNullableString(e.reason),
      solution: toNullableString(e.solution)
    }));

  const envNames = Array.isArray(authObj.envNames)
    ? (authObj.envNames as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  const confRaw = metaRaw.confidence;
  let confidence = 0;
  if (typeof confRaw === "number" && Number.isFinite(confRaw)) confidence = Math.min(100, Math.max(0, confRaw));
  else confidence = toNullableInt(confRaw) ?? 0;

  const baseUrl = toNullableString(endpoints.baseUrl);
  const chatEndpoint = toNullableString(endpoints.chatCompletions);
  const modelsEndpoint = toNullableString(endpoints.models);
  const firstModel = models.find((m) => m.name)?.name ?? null;
  const inferredProvider =
    CLIENT_PROVIDER_TYPE.has(String(clientRaw.providerTypeToChoose))
      ? String(clientRaw.providerTypeToChoose)
      : toNullableBool(comp.isOpenAICompatible)
        ? "OpenAI Compatible"
        : "Unknown";
  const copyableRaw = asRecord(clientRaw.copyableConfig) ?? {};
  const copyableConfig = {
    provider: toNullableString(copyableRaw.provider) ?? inferredProvider,
    baseUrl: toNullableString(copyableRaw.baseUrl) ?? toNullableString(clientRaw.baseUrlToFill) ?? baseUrl,
    apiKey: toNullableString(copyableRaw.apiKey) ?? "YOUR_API_KEY",
    model: toNullableString(copyableRaw.model) ?? firstModel ?? "按文档填写模型名"
  };
  const guideFallback = { provider: copyableConfig.provider, baseUrl: copyableConfig.baseUrl, model: copyableConfig.model };
  const clientSpecificRaw = asRecord(clientRaw.clientSpecificGuides) ?? {};
  const shouldIncludeV1 =
    typeof clientRaw.shouldUserIncludeV1 === "boolean"
      ? clientRaw.shouldUserIncludeV1
      : baseUrl
        ? /\/v1\/?$/i.test(baseUrl)
        : null;
  const shouldIncludeChat =
    typeof clientRaw.shouldUserIncludeChatCompletions === "boolean"
      ? clientRaw.shouldUserIncludeChatCompletions
      : false;

  return {
    provider: {
      name: toNullableString(prov.name),
      officialWebsite: toNullableString(prov.officialWebsite),
      docsUrl: toNullableString(prov.docsUrl),
      description: toNullableString(prov.description)
    },
    compatibility: {
      isOpenAICompatible: toNullableBool(comp.isOpenAICompatible),
      compatibleLevel,
      evidence: toNullableString(comp.evidence),
      notes: toNullableString(comp.notes)
    },
    auth: {
      type: authType,
      headerName: toNullableString(authObj.headerName),
      headerValueTemplate: toNullableString(authObj.headerValueTemplate),
      envNames,
      notes: toNullableString(authObj.notes)
    },
    endpoints: {
      baseUrl: toNullableString(endpoints.baseUrl),
      chatCompletions: toNullableString(endpoints.chatCompletions),
      embeddings: toNullableString(endpoints.embeddings),
      models: toNullableString(endpoints.models)
    },
    models,
    minimalRequests: {
      chat: {
        method: toNullableString(chat.method),
        url: toNullableString(chat.url),
        headers: ensureRecordHeaders(chat.headers),
        body: ensureRecordHeaders(chat.body)
      },
      modelsList: {
        method: toNullableString(ml.method),
        url: toNullableString(ml.url),
        headers: ensureRecordHeaders(ml.headers)
      }
    },
    codeExamples: {
      curl: toNullableString(codeEx.curl),
      python: toNullableString(codeEx.python),
      javascript: toNullableString(codeEx.javascript)
    },
    commonErrors,
    limits: {
      rateLimit: toNullableString(limits.rateLimit),
      quota: toNullableString(limits.quota),
      notes: toNullableString(limits.notes)
    },
    clientConfigGuide: {
      providerTypeToChoose: inferredProvider,
      baseUrlToFill: toNullableString(clientRaw.baseUrlToFill) ?? baseUrl,
      apiKeyFieldInstruction: toNullableString(clientRaw.apiKeyFieldInstruction) ?? "把平台后台生成的 API Key 填到软件的 API Key / Key / Token 输入框。",
      modelNameInstruction: toNullableString(clientRaw.modelNameInstruction) ?? (firstModel ? `可先使用文档中的模型名：${firstModel}` : "按文档复制完整模型名，不要自己简写。"),
      chatEndpointFullUrl: toNullableString(clientRaw.chatEndpointFullUrl) ?? buildFullUrl(baseUrl, chatEndpoint),
      modelsEndpointFullUrl: toNullableString(clientRaw.modelsEndpointFullUrl) ?? buildFullUrl(baseUrl, modelsEndpoint),
      shouldUserIncludeV1: shouldIncludeV1,
      shouldUserIncludeChatCompletions: shouldIncludeChat,
      shouldUserIncludeFullEndpoint: typeof clientRaw.shouldUserIncludeFullEndpoint === "boolean" ? clientRaw.shouldUserIncludeFullEndpoint : false,
      baseUrlExplanation: toNullableString(clientRaw.baseUrlExplanation) ?? "Base URL 是软件要填写的接口根地址，OpenAI Compatible 平台通常填到 /v1 即可。",
      endpointExplanation: toNullableString(clientRaw.endpointExplanation) ?? "Endpoint 是软件在 Base URL 后自动拼接的接口路径，例如 /chat/completions。",
      beginnerSummary:
        toNullableString(clientRaw.beginnerSummary) ??
        "在大多数 AI 编程软件中，Provider 选择 OpenAI Compatible，Base URL 通常填到 /v1 即可，不要手动添加 /chat/completions，软件会自动拼接。",
      commonMistakes:
        toStringArray(clientRaw.commonMistakes).length > 0
          ? toStringArray(clientRaw.commonMistakes)
          : [
              "把 Base URL 写成完整 /chat/completions，导致软件再次拼接后路径错误。",
              "漏写或重复写 /v1，导致请求 404。",
              "模型名没有按文档完整复制，导致 model not found。"
            ],
      copyableConfig,
      clientSpecificGuides: {
        cursor: normalizeClientGuideItem(clientSpecificRaw.cursor, guideFallback),
        trae: normalizeClientGuideItem(clientSpecificRaw.trae, guideFallback),
        cline: normalizeClientGuideItem(clientSpecificRaw.cline, guideFallback),
        continue: normalizeClientGuideItem(clientSpecificRaw.continue, guideFallback),
        kiloCode: normalizeClientGuideItem(clientSpecificRaw.kiloCode, guideFallback),
        codexCli: normalizeClientGuideItem(clientSpecificRaw.codexCli, guideFallback),
        chatbox: normalizeClientGuideItem(clientSpecificRaw.chatbox, guideFallback),
        cherryStudio: normalizeClientGuideItem(clientSpecificRaw.cherryStudio, guideFallback)
      }
    },
    analysisMeta: {
      confidence,
      unknownFields: Array.isArray(metaRaw.unknownFields)
        ? (metaRaw.unknownFields as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      warnings: Array.isArray(metaRaw.warnings)
        ? (metaRaw.warnings as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      sourceUrls: Array.isArray(metaRaw.sourceUrls)
        ? (metaRaw.sourceUrls as unknown[]).filter((x): x is string => typeof x === "string")
        : []
    }
  };
}

export type ParseAiJsonResult =
  | { ok: true; value: Record<string, unknown>; repairSteps: string[] }
  | { ok: false; error: string; repairSteps: string[]; snippet: string };

function uniqueStrings(arr: string[]): string[] {
  return [...new Set(arr)];
}

/**
 * 尽力从模型输出中提取并解析 JSON 对象。
 */
export function repairParseAiJsonContent(rawContent: string): ParseAiJsonResult {
  const repairSteps: string[] = [];
  const trimmed = String(rawContent).trim();
  const fenced = stripMarkdownFenceLoose(trimmed);
  if (fenced !== trimmed) repairSteps.push("strip_fence_loose");

  const extracted = extractFirstJsonObject(fenced) ?? extractFirstJsonObject(trimmed);
  if (extracted && extracted !== fenced) repairSteps.push("extract_balanced_object");

  /** 候选字符串：去重后依次 JSON.parse */
  const candidatesRaw = uniqueStrings([
    trimmed,
    fenced,
    ...(extracted ? [extracted, stripTrailingCommas(extracted)] : []),
    stripTrailingCommas(fenced),
    ...(extracted ? [stripMarkdownFenceLoose(stripTrailingCommas(extracted))] : [])
  ]);

  const seen = new Set<string>();
  for (const cand of candidatesRaw) {
    const text = cand.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
      const unwrapped = unwrapAnalysisEnvelope(parsed as Record<string, unknown>);
      repairSteps.push("parse_json_ok");
      return { ok: true, value: unwrapped, repairSteps: uniqueStrings(repairSteps) };
    } catch {
      continue;
    }
  }

  return {
    ok: false,
    error: "无法将模型输出解析为 JSON 对象",
    repairSteps: uniqueStrings([...repairSteps, "parse_json_failed"]),
    snippet: fenced.slice(0, 1500)
  };
}
