import "dotenv/config";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const clientKeys = ["cursor", "trae", "cline", "continue", "kiloCode", "codexCli", "chatbox", "cherryStudio"];

function joinUrl(baseUrl, path) {
  if (!baseUrl || !path) return null;
  const left = baseUrl.replace(/\/+$/, "");
  const right = path.startsWith("/") ? path : `/${path}`;
  return `${left}${right}`;
}

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function makeClientGuides(seed, guide) {
  const base = {
    provider: guide.providerTypeToChoose,
    baseUrl: guide.baseUrlToFill ?? seed.baseUrl ?? null,
    apiKey: seed.apiKeyPlaceholder ?? "YOUR_API_KEY",
    model: guide.copyableModel ?? seed.models[0]?.name ?? null,
    notes: guide.softwareNotes ?? []
  };
  return Object.fromEntries(clientKeys.map((key) => [key, { ...base }]));
}

function commonGuide(seed, overrides = {}) {
  const providerTypeToChoose =
    overrides.providerTypeToChoose ??
    (seed.isOpenAICompatible ? "OpenAI Compatible" : seed.clientProviderType ?? "Custom");
  const baseUrlToFill = overrides.baseUrlToFill ?? seed.baseUrl ?? null;
  const endpoint = overrides.chatEndpointPath ?? seed.chatCompletionsPath ?? null;
  const chatEndpointFullUrl = overrides.chatEndpointFullUrl ?? joinUrl(baseUrlToFill, endpoint);
  const model = overrides.copyableModel ?? seed.models[0]?.name ?? "按平台模型列表填写";
  const shouldUserIncludeChatCompletions =
    overrides.shouldUserIncludeChatCompletions ?? (seed.isOpenAICompatible ? false : null);
  const shouldUserIncludeFullEndpoint = overrides.shouldUserIncludeFullEndpoint ?? false;

  const guide = {
    providerTypeToChoose,
    baseUrlToFill,
    apiKeyFieldInstruction:
      overrides.apiKeyFieldInstruction ??
      (seed.authHeaderName === "x-api-key"
        ? "把平台 API Key 填到软件的 API Key / x-api-key 字段。"
        : "把平台 API Key 填到软件的 API Key 字段，通常会作为 Authorization: Bearer 使用。"),
    modelNameInstruction:
      overrides.modelNameInstruction ?? `先复制模型名：${model}；其它模型以平台 /models 或官方文档为准。`,
    chatEndpointFullUrl,
    modelsEndpointFullUrl: overrides.modelsEndpointFullUrl ?? joinUrl(baseUrlToFill, seed.modelsPath),
    shouldUserIncludeV1: overrides.shouldUserIncludeV1 ?? Boolean(baseUrlToFill?.match(/\/v\d+\/?$/)),
    shouldUserIncludeChatCompletions,
    shouldUserIncludeFullEndpoint,
    baseUrlExplanation:
      overrides.baseUrlExplanation ??
      "Base URL 是软件里要填写的接口根地址。对 OpenAI Compatible 平台，通常填到 /v1 或平台文档给出的兼容根路径即可。",
    endpointExplanation:
      overrides.endpointExplanation ??
      "Endpoint 是软件按协议自动拼接的接口路径，例如 /chat/completions。除非软件明确要求完整接口，一般不要把它写进 Base URL。",
    beginnerSummary:
      overrides.beginnerSummary ??
      (seed.isOpenAICompatible
        ? `Provider 选择 ${providerTypeToChoose}，Base URL 填 ${baseUrlToFill}，模型名按文档复制。大多数 AI 编程软件会自动拼接 /chat/completions。`
        : `Provider 选择 ${providerTypeToChoose} 或 Custom，按该平台专用协议填写 Base URL、API Key 和模型名。`),
    commonMistakes:
      overrides.commonMistakes ?? [
        "把完整 /chat/completions 填进 Base URL，导致软件再次拼接后 404。",
        "漏写或重复写 /v1，导致接口地址不对。",
        "模型名自己简写，导致 model not found。"
      ],
    copyableConfig: {
      provider: providerTypeToChoose,
      baseUrl: baseUrlToFill,
      apiKey: seed.apiKeyPlaceholder ?? "YOUR_API_KEY",
      model
    },
    clientSpecificGuides: makeClientGuides(seed, {
      providerTypeToChoose,
      baseUrlToFill,
      copyableModel: model,
      softwareNotes:
        overrides.softwareNotes ??
        (seed.isOpenAICompatible
          ? ["通用 OpenAI Compatible 模板；具体软件字段名可能略有差异。", "如果报 404，优先检查 /v1 和 /chat/completions 是否重复。"]
          : ["该平台不是标准 OpenAI Compatible 时，优先选择软件内置的专用 Provider。"])
    })
  };

  return guide;
}

function makeAnalysis(seed, overrides = {}) {
  const guide = commonGuide(seed, overrides.clientGuide ?? {});
  return {
    provider: {
      name: seed.name,
      aliases: seed.aliases ?? [],
      officialWebsite: seed.officialWebsite,
      docsUrl: seed.docsUrl,
      notes: seed.notes ?? null
    },
    compatibility: {
      isOpenAICompatible: seed.isOpenAICompatible,
      compatibleLevel: seed.compatibleLevel,
      evidence: seed.compatibilityEvidence ?? null,
      notes: seed.compatibilityNotes ?? null
    },
    auth: {
      type: seed.authType,
      headerName: seed.authHeaderName,
      headerValueTemplate: seed.authHeaderTemplate,
      envNames: seed.envNames ?? ["API_KEY"],
      notes: seed.authNotes ?? null
    },
    endpoints: {
      baseUrl: seed.baseUrl,
      chatCompletions: seed.chatCompletionsPath,
      embeddings: seed.embeddingsPath ?? null,
      models: seed.modelsPath
    },
    models: seed.models.map((model) => ({
      name: model.name,
      type: model.type ?? "chat",
      contextWindow: model.contextWindow ?? null,
      maxOutputTokens: model.maxOutputTokens ?? null,
      supportsStreaming: model.supportsStreaming ?? true,
      supportsVision: model.supportsVision ?? false,
      supportsTools: model.supportsTools ?? null,
      supportsJsonMode: model.supportsJsonMode ?? null,
      notes: model.notes ?? "起始样例，实际可用模型以平台模型列表为准。"
    })),
    minimalRequests: {
      chat: {
        method: "POST",
        url: guide.chatEndpointFullUrl,
        headers: seed.minimalHeaders ?? {
          [seed.authHeaderName ?? "Authorization"]: seed.authHeaderTemplate ?? "Bearer YOUR_API_KEY",
          "Content-Type": "application/json"
        },
        body: seed.minimalBody ?? { model: seed.models[0]?.name ?? "MODEL_NAME", messages: [{ role: "user", content: "Hi" }], max_tokens: 1, temperature: 0 }
      },
      modelsList: {
        method: seed.modelsPath ? "GET" : null,
        url: guide.modelsEndpointFullUrl,
        headers: seed.modelsPath ? { [seed.authHeaderName ?? "Authorization"]: seed.authHeaderTemplate ?? "Bearer YOUR_API_KEY" } : {}
      }
    },
    codeExamples: {
      curl: seed.curlExample ?? null,
      python: seed.pythonExample ?? null,
      javascript: seed.javascriptExample ?? null
    },
    commonErrors: seed.commonErrors,
    limits: {
      rateLimit: seed.rateLimit ?? null,
      quota: seed.quota ?? null,
      notes: seed.limitNotes ?? "不同账号、地区和套餐可能不同，最终以平台控制台为准。"
    },
    clientConfigGuide: guide,
    analysisMeta: {
      confidence: seed.confidence ?? 80,
      unknownFields: seed.unknownFields ?? [],
      warnings: [
        "这是内置起始知识库数据，模型列表和价格额度可能变化，正式使用前建议用平台 /models 或官方文档复核。",
        ...(seed.warnings ?? [])
      ],
      sourceUrls: [seed.docsUrl, ...(seed.extraSourceUrls ?? [])].filter(Boolean)
    }
  };
}

function provider(seed) {
  const analysis = makeAnalysis(seed, seed.overrides ?? {});
  const docBody = [
    `# ${seed.name} 接入速查`,
    "",
    seed.description,
    "",
    `- Provider: ${analysis.clientConfigGuide.providerTypeToChoose}`,
    `- Base URL: ${analysis.clientConfigGuide.baseUrlToFill ?? "未固定"}`,
    `- Chat URL: ${analysis.clientConfigGuide.chatEndpointFullUrl ?? "按软件/协议生成"}`,
    `- API Key: ${analysis.clientConfigGuide.apiKeyFieldInstruction}`,
    `- 推荐先测模型: ${analysis.clientConfigGuide.copyableConfig.model ?? "按平台模型列表填写"}`,
    "",
    "## 小白提醒",
    analysis.clientConfigGuide.beginnerSummary,
    "",
    "## 常见填错方式",
    ...analysis.clientConfigGuide.commonMistakes.map((item) => `- ${item}`),
    "",
    `资料来源：${seed.docsUrl}`
  ].join("\n");

  return { ...seed, analysis, docBody };
}

const standardErrors = [
  { error: "400 BAD_REQUEST", reason: "请求体格式、字段名或模型能力不匹配。", solution: "检查 model、messages、max_tokens 等字段，先用最小请求体测试。" },
  { error: "401 AUTH_ERROR", reason: "API Key 缺失、错误或 Header 写法不对。", solution: "重新复制 Key，确认使用 Bearer 或平台要求的专用 Header。" },
  { error: "402 QUOTA_ERROR", reason: "账号余额、额度或套餐不可用。", solution: "检查平台控制台余额、免费额度和模型权限。" },
  { error: "404 ENDPOINT_ERROR", reason: "Base URL、/v1 或 /chat/completions 拼错。", solution: "如果软件填 Base URL，通常不要手动加 /chat/completions。" },
  { error: "422 MODEL_ERROR", reason: "模型名不存在、不可用，或请求参数不被该模型接受。", solution: "复制官方完整模型名，必要时换成平台模型列表里的可用模型。" }
];

const seeds = [
  provider({
    slug: "openai",
    name: "OpenAI",
    aliases: ["ChatGPT API"],
    description: "OpenAI 官方 API，很多 AI 编程软件的 OpenAI Compatible 配置都以它的 /v1 协议为参照。",
    docsUrl: "https://platform.openai.com/docs/api-reference",
    officialWebsite: "https://platform.openai.com",
    isOpenAICompatible: true,
    compatibleLevel: "full",
    baseUrl: "https://api.openai.com/v1",
    authType: "bearer",
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    chatCompletionsPath: "/chat/completions",
    modelsPath: "/models",
    models: [
      { name: "gpt-4.1", type: "chat", supportsVision: true, supportsTools: true },
      { name: "gpt-4.1-mini", type: "chat", supportsVision: true, supportsTools: true },
      { name: "gpt-4o", type: "chat", supportsVision: true, supportsTools: true },
      { name: "gpt-4o-mini", type: "chat", supportsVision: true, supportsTools: true },
      { name: "o4-mini", type: "reasoning", supportsTools: true }
    ],
    commonErrors: standardErrors
  }),
  provider({
    slug: "anthropic",
    name: "Anthropic Claude",
    aliases: ["Claude API"],
    description: "Anthropic Messages API，鉴权和接口路径与 OpenAI Compatible 不同；软件有 Anthropic Provider 时优先选 Anthropic。",
    docsUrl: "https://docs.anthropic.com/en/api/messages",
    officialWebsite: "https://www.anthropic.com",
    isOpenAICompatible: false,
    compatibleLevel: "none",
    baseUrl: "https://api.anthropic.com/v1",
    authType: "x-api-key",
    authHeaderName: "x-api-key",
    authHeaderTemplate: "YOUR_API_KEY",
    chatCompletionsPath: "/messages",
    modelsPath: "/models",
    models: [
      { name: "claude-3-5-sonnet-latest", type: "chat", supportsVision: true, supportsTools: true },
      { name: "claude-3-5-haiku-latest", type: "chat", supportsVision: true, supportsTools: true },
      { name: "claude-3-opus-latest", type: "chat", supportsVision: true, supportsTools: true }
    ],
    minimalHeaders: { "x-api-key": "YOUR_API_KEY", "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    minimalBody: { model: "claude-3-5-haiku-latest", max_tokens: 1, messages: [{ role: "user", content: "Hi" }] },
    commonErrors: standardErrors,
    overrides: { clientGuide: { providerTypeToChoose: "Anthropic", shouldUserIncludeV1: true, shouldUserIncludeChatCompletions: null, commonMistakes: ["把 Anthropic 当成 OpenAI Compatible，导致接口路径和 Header 都不对。", "漏填 anthropic-version Header。", "模型名没有使用 Claude 官方完整名称。"] } }
  }),
  provider({
    slug: "google-gemini",
    name: "Google Gemini",
    aliases: ["Google AI Studio"],
    description: "Google Gemini API，常见接口是 generateContent，不是标准 /chat/completions。",
    docsUrl: "https://ai.google.dev/api/generate-content",
    officialWebsite: "https://ai.google.dev",
    isOpenAICompatible: false,
    compatibleLevel: "none",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    authType: "api-key",
    authHeaderName: "x-goog-api-key",
    authHeaderTemplate: "YOUR_API_KEY",
    chatCompletionsPath: "/models/{model}:generateContent",
    modelsPath: "/models",
    models: [
      { name: "gemini-2.0-flash", type: "chat", supportsVision: true },
      { name: "gemini-1.5-pro", type: "chat", supportsVision: true },
      { name: "gemini-1.5-flash", type: "chat", supportsVision: true }
    ],
    minimalHeaders: { "x-goog-api-key": "YOUR_API_KEY", "Content-Type": "application/json" },
    minimalBody: { contents: [{ parts: [{ text: "Hi" }] }], generationConfig: { maxOutputTokens: 1, temperature: 0 } },
    commonErrors: standardErrors,
    overrides: { clientGuide: { providerTypeToChoose: "Gemini", shouldUserIncludeV1: false, shouldUserIncludeChatCompletions: null, commonMistakes: ["把 Gemini 的 generateContent 当成 /chat/completions。", "API Key 没有放到 x-goog-api-key 或软件 Gemini Key 字段。", "模型路径漏写 models/{model}:generateContent。"] } }
  }),
  provider({
    slug: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek 提供 OpenAI Compatible API，常用于 Cursor、Cline、Continue 等软件的兼容模式。",
    docsUrl: "https://api-docs.deepseek.com/",
    officialWebsite: "https://www.deepseek.com",
    isOpenAICompatible: true,
    compatibleLevel: "full",
    baseUrl: "https://api.deepseek.com",
    authType: "bearer",
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    chatCompletionsPath: "/chat/completions",
    modelsPath: "/models",
    models: [
      { name: "deepseek-v4-flash", type: "chat", supportsTools: true },
      { name: "deepseek-v4-pro", type: "reasoning" },
      { name: "deepseek-chat", type: "chat", supportsTools: true, notes: "兼容旧名，官方文档提示将于 2026-07-24 废弃。" },
      { name: "deepseek-reasoner", type: "reasoning", notes: "兼容旧名，官方文档提示将于 2026-07-24 废弃。" }
    ],
    commonErrors: standardErrors,
    warnings: ["DeepSeek 官方也说明可用 https://api.deepseek.com/v1 作为 OpenAI SDK base_url；不同软件如要求 /v1，可改填该地址。"],
    overrides: { clientGuide: { shouldUserIncludeV1: false, commonMistakes: ["有些软件需要 /v1，有些按官方 base_url 可不带 /v1；报 404 时可在 https://api.deepseek.com 和 https://api.deepseek.com/v1 间切换测试。", "把 /chat/completions 填进 Base URL。", "deepseek-reasoner 当普通聊天模型使用时参数不兼容。"] } }
  }),
  provider({
    slug: "qwen-dashscope",
    name: "通义千问 DashScope",
    aliases: ["Qwen", "阿里云百炼"],
    description: "阿里云 DashScope 的 OpenAI 兼容模式，Base URL 通常是 compatible-mode/v1。",
    docsUrl: "https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope",
    officialWebsite: "https://bailian.console.aliyun.com",
    isOpenAICompatible: true,
    compatibleLevel: "full",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    authType: "bearer",
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    chatCompletionsPath: "/chat/completions",
    modelsPath: "/models",
    models: [
      { name: "qwen-plus", type: "chat", supportsTools: true },
      { name: "qwen-turbo", type: "chat" },
      { name: "qwen-max", type: "chat", supportsTools: true },
      { name: "qwen-long", type: "chat" }
    ],
    commonErrors: standardErrors
  }),
  provider({
    slug: "moonshot-kimi",
    name: "Moonshot Kimi",
    aliases: ["Kimi API", "Moonshot AI"],
    description: "Moonshot Kimi API 使用 OpenAI Compatible 风格，常见 Base URL 为 /v1。",
    docsUrl: "https://platform.moonshot.cn/docs",
    officialWebsite: "https://platform.moonshot.cn",
    isOpenAICompatible: true,
    compatibleLevel: "full",
    baseUrl: "https://api.moonshot.cn/v1",
    authType: "bearer",
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    chatCompletionsPath: "/chat/completions",
    modelsPath: "/models",
    models: [
      { name: "moonshot-v1-8k", type: "chat" },
      { name: "moonshot-v1-32k", type: "chat" },
      { name: "moonshot-v1-128k", type: "chat" }
    ],
    commonErrors: standardErrors
  }),
  provider({
    slug: "zhipu-glm",
    name: "智谱 GLM",
    aliases: ["BigModel", "ZhipuAI"],
    description: "智谱开放平台提供 OpenAI Compatible 风格的聊天接口，常见路径为 /api/paas/v4。",
    docsUrl: "https://docs.bigmodel.cn/",
    officialWebsite: "https://open.bigmodel.cn",
    isOpenAICompatible: true,
    compatibleLevel: "partial",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    authType: "bearer",
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    chatCompletionsPath: "/chat/completions",
    modelsPath: "/models",
    models: [
      { name: "glm-4-plus", type: "chat", supportsTools: true },
      { name: "glm-4", type: "chat", supportsTools: true },
      { name: "glm-4-flash", type: "chat" }
    ],
    commonErrors: standardErrors,
    warnings: ["智谱模型名和可用接口会随账号权限变化，建议以控制台和 /models 返回为准。"]
  }),
  provider({
    slug: "openrouter",
    name: "OpenRouter",
    description: "OpenRouter 聚合多个模型供应商，OpenAI Compatible Base URL 通常为 /api/v1，模型名包含供应商前缀。",
    docsUrl: "https://openrouter.ai/docs/quickstart",
    officialWebsite: "https://openrouter.ai",
    isOpenAICompatible: true,
    compatibleLevel: "full",
    baseUrl: "https://openrouter.ai/api/v1",
    authType: "bearer",
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    chatCompletionsPath: "/chat/completions",
    modelsPath: "/models",
    models: [
      { name: "openai/gpt-4o-mini", type: "chat", supportsVision: true },
      { name: "anthropic/claude-3.5-sonnet", type: "chat", supportsVision: true },
      { name: "deepseek/deepseek-chat", type: "chat" },
      { name: "google/gemini-flash-1.5", type: "chat", supportsVision: true }
    ],
    commonErrors: standardErrors,
    warnings: ["OpenRouter 模型 ID 经常更新，建议优先复制官网 Models 页的完整 ID。"]
  }),
  provider({
    slug: "siliconflow",
    name: "SiliconFlow",
    aliases: ["硅基流动"],
    description: "SiliconFlow 提供 OpenAI Compatible 接口，模型名通常带组织或模型仓库前缀。",
    docsUrl: "https://docs.siliconflow.cn/",
    officialWebsite: "https://siliconflow.cn",
    isOpenAICompatible: true,
    compatibleLevel: "full",
    baseUrl: "https://api.siliconflow.cn/v1",
    authType: "bearer",
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    chatCompletionsPath: "/chat/completions",
    modelsPath: "/models",
    models: [
      { name: "deepseek-ai/DeepSeek-V3", type: "chat" },
      { name: "deepseek-ai/DeepSeek-R1", type: "reasoning" },
      { name: "Qwen/Qwen2.5-72B-Instruct", type: "chat" },
      { name: "THUDM/glm-4-9b-chat", type: "chat" }
    ],
    commonErrors: standardErrors
  }),
  provider({
    slug: "volcengine-ark",
    name: "火山方舟 Ark",
    aliases: ["Volcengine Ark"],
    description: "火山方舟兼容 OpenAI 风格接口，但 model 常常填写的是方舟控制台创建的 endpoint id。",
    docsUrl: "https://www.volcengine.com/docs/82379",
    officialWebsite: "https://www.volcengine.com/product/ark",
    isOpenAICompatible: true,
    compatibleLevel: "partial",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    authType: "bearer",
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    chatCompletionsPath: "/chat/completions",
    modelsPath: "/models",
    models: [
      { name: "YOUR_ARK_ENDPOINT_ID", type: "chat", notes: "方舟通常填写控制台 Endpoint ID，不是裸模型族名称。" },
      { name: "doubao-seed-1-6", type: "chat", notes: "示例模型族名称，实际调用时以控制台 Endpoint ID 为准。" }
    ],
    commonErrors: standardErrors,
    warnings: ["火山方舟 model 字段经常是 Endpoint ID；如果报 model not found，先回控制台复制 Endpoint ID。"]
  }),
  provider({
    slug: "baidu-qianfan",
    name: "百度千帆",
    aliases: ["Qianfan"],
    description: "百度千帆提供大模型调用能力，部分场景支持 OpenAI Compatible 风格接入。",
    docsUrl: "https://cloud.baidu.com/doc/WENXINWORKSHOP/index.html",
    officialWebsite: "https://cloud.baidu.com/product/wenxinworkshop",
    isOpenAICompatible: true,
    compatibleLevel: "partial",
    baseUrl: "https://qianfan.baidubce.com/v2",
    authType: "bearer",
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    chatCompletionsPath: "/chat/completions",
    modelsPath: "/models",
    models: [
      { name: "ernie-4.0-turbo-8k", type: "chat" },
      { name: "ernie-3.5-8k", type: "chat" },
      { name: "deepseek-v3", type: "chat" }
    ],
    commonErrors: standardErrors,
    confidence: 65,
    warnings: ["千帆鉴权、地域和模型 ID 受控制台配置影响较大；这条是起始模板，建议用官方文档和控制台复核。"]
  }),
  provider({
    slug: "ollama",
    name: "Ollama",
    description: "本地模型运行工具，提供原生 /api 接口，也提供 OpenAI Compatible 的 /v1 接口。",
    docsUrl: "https://docs.ollama.com/openai",
    officialWebsite: "https://ollama.com",
    isOpenAICompatible: true,
    compatibleLevel: "partial",
    baseUrl: "http://127.0.0.1:11434/v1",
    authType: "none",
    authHeaderName: null,
    authHeaderTemplate: null,
    chatCompletionsPath: "/chat/completions",
    modelsPath: "/models",
    models: [
      { name: "llama3.1", type: "chat" },
      { name: "qwen2.5", type: "chat" },
      { name: "deepseek-r1", type: "reasoning" }
    ],
    apiKeyPlaceholder: "ollama",
    commonErrors: standardErrors,
    overrides: { clientGuide: { providerTypeToChoose: "Ollama", apiKeyFieldInstruction: "本地 Ollama 通常不需要真实 API Key；如果软件必填，可填 ollama。", commonMistakes: ["Ollama 服务没启动。", "模型没有先执行 ollama pull。", "把原生 /api/chat 和 OpenAI Compatible /v1/chat/completions 混用。"] } }
  }),
  provider({
    slug: "lm-studio",
    name: "LM Studio",
    description: "本地桌面模型工具，开启 Local Server 后通常暴露 OpenAI Compatible /v1 接口。",
    docsUrl: "https://lmstudio.ai/docs",
    officialWebsite: "https://lmstudio.ai",
    isOpenAICompatible: true,
    compatibleLevel: "partial",
    baseUrl: "http://localhost:1234/v1",
    authType: "none",
    authHeaderName: null,
    authHeaderTemplate: null,
    chatCompletionsPath: "/chat/completions",
    modelsPath: "/models",
    models: [
      { name: "local-model", type: "chat", notes: "填写 LM Studio 当前加载模型的名称。" }
    ],
    apiKeyPlaceholder: "lm-studio",
    commonErrors: standardErrors,
    overrides: { clientGuide: { providerTypeToChoose: "OpenAI Compatible", apiKeyFieldInstruction: "本地 LM Studio 通常不需要真实 API Key；软件必填时可填任意占位值。", commonMistakes: ["Local Server 没打开。", "端口不是 1234。", "模型未加载就测试。"] } }
  }),
  provider({
    slug: "vllm",
    name: "vLLM",
    description: "常见自部署推理服务，OpenAI Compatible Server 默认常用 /v1 路径。",
    docsUrl: "https://docs.vllm.ai/",
    officialWebsite: "https://www.vllm.ai",
    isOpenAICompatible: true,
    compatibleLevel: "partial",
    baseUrl: "http://localhost:8000/v1",
    authType: "optional-bearer",
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    chatCompletionsPath: "/chat/completions",
    modelsPath: "/models",
    models: [
      { name: "served-model-name", type: "chat", notes: "填写启动 vLLM 时指定的 served model name。" }
    ],
    commonErrors: standardErrors
  }),
  provider({
    slug: "xinference",
    name: "Xinference",
    description: "本地或私有化模型平台，通常可以通过 /v1 使用 OpenAI Compatible 接口。",
    docsUrl: "https://inference.readthedocs.io/",
    officialWebsite: "https://github.com/xorbitsai/inference",
    isOpenAICompatible: true,
    compatibleLevel: "partial",
    baseUrl: "http://localhost:9997/v1",
    authType: "optional-bearer",
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    chatCompletionsPath: "/chat/completions",
    modelsPath: "/models",
    models: [
      { name: "model_uid", type: "chat", notes: "填写启动模型实例后的 UID。" }
    ],
    commonErrors: standardErrors
  }),
  provider({
    slug: "litellm",
    name: "LiteLLM Proxy",
    description: "OpenAI Compatible 代理层，可把多个上游模型统一成 /v1 接口。",
    docsUrl: "https://docs.litellm.ai/docs/proxy/user_keys",
    officialWebsite: "https://www.litellm.ai",
    isOpenAICompatible: true,
    compatibleLevel: "full",
    baseUrl: "http://localhost:4000/v1",
    authType: "bearer",
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    chatCompletionsPath: "/chat/completions",
    modelsPath: "/models",
    models: [
      { name: "gpt-4o-mini", type: "chat", notes: "示例。实际模型名取决于 LiteLLM config.yaml 里的 model_name。" },
      { name: "claude-3-5-sonnet", type: "chat", notes: "示例。实际可用名称以代理配置为准。" }
    ],
    commonErrors: standardErrors
  }),
  provider({
    slug: "oneapi-newapi",
    name: "OneAPI / NewAPI",
    description: "常见中转聚合面板，通常对外暴露 OpenAI Compatible /v1 接口。",
    docsUrl: "https://github.com/songquanpeng/one-api",
    officialWebsite: "https://github.com/Calcium-Ion/new-api",
    isOpenAICompatible: true,
    compatibleLevel: "partial",
    baseUrl: "https://YOUR-ONEAPI-DOMAIN/v1",
    authType: "bearer",
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    chatCompletionsPath: "/chat/completions",
    modelsPath: "/models",
    models: [
      { name: "gpt-4o-mini", type: "chat", notes: "示例。实际名称由面板渠道和模型映射决定。" },
      { name: "deepseek-chat", type: "chat", notes: "示例。实际名称以面板模型列表为准。" }
    ],
    commonErrors: standardErrors,
    warnings: ["中转面板的域名、Key、模型名完全由部署者配置，导入数据只提供填写模板。"]
  })
];

async function replaceChildren(providerId) {
  await prisma.providerModel.deleteMany({ where: { providerId } });
  await prisma.providerDoc.deleteMany({ where: { providerId } });
  await prisma.codeExample.deleteMany({ where: { providerId } });
  await prisma.commonError.deleteMany({ where: { providerId } });
}

async function upsertSeed(seed) {
  const existing = await prisma.provider.findUnique({ where: { slug: seed.slug } });
  const providerData = {
    name: seed.name,
    slug: seed.slug,
    description: seed.description,
    docsUrl: seed.docsUrl,
    officialWebsite: seed.officialWebsite,
    isOpenAICompatible: seed.isOpenAICompatible,
    compatibleLevel: seed.compatibleLevel,
    baseUrl: seed.baseUrl,
    authType: seed.authType,
    authHeaderName: seed.authHeaderName,
    authHeaderTemplate: seed.authHeaderTemplate,
    chatCompletionsPath: seed.chatCompletionsPath,
    embeddingsPath: seed.embeddingsPath ?? null,
    modelsPath: seed.modelsPath,
    rawAnalysisJson: JSON.stringify(seed.analysis, null, 2)
  };

  const row = existing
    ? await prisma.provider.update({ where: { id: existing.id }, data: providerData })
    : await prisma.provider.create({ data: providerData });

  await replaceChildren(row.id);

  await prisma.providerDoc.create({
    data: {
      providerId: row.id,
      url: seed.docsUrl,
      title: `${seed.name} 接入速查`,
      contentMarkdown: seed.docBody,
      contentHash: hash(seed.docBody)
    }
  });

  await prisma.providerModel.createMany({
    data: seed.analysis.models
      .filter((model) => model.name)
      .map((model) => ({
        providerId: row.id,
        name: model.name,
        type: model.type,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens,
        supportsStreaming: model.supportsStreaming,
        supportsVision: model.supportsVision,
        supportsTools: model.supportsTools,
        supportsJsonMode: model.supportsJsonMode,
        notes: model.notes
      }))
  });

  await prisma.commonError.createMany({
    data: seed.commonErrors.map((err) => ({
      providerId: row.id,
      error: err.error,
      reason: err.reason,
      solution: err.solution
    }))
  });

  return row;
}

async function main() {
  const results = [];
  for (const seed of seeds) {
    const row = await upsertSeed(seed);
    results.push(`${row.name} (${row.slug})`);
  }
  console.log(`Seeded ${results.length} providers:`);
  for (const item of results) console.log(`- ${item}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
