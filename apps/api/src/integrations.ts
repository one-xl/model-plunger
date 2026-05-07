import type { PrismaClient } from "@prisma/client";

/** 接入目标（编辑器 / SDK / CLI 等），静态内置。 */
export const INTEGRATION_TARGETS = [
  {
    id: "curl",
    name: "curl",
    category: "cli" as const,
    supportedProtocols: ["openai-compatible", "ollama", "gemini"] as const,
    configFormat: "curl" as const,
    notes: ["适合快速验证连通性与鉴权。"]
  },
  {
    id: "openai-sdk",
    name: "OpenAI SDK（Python / Node）",
    category: "sdk" as const,
    supportedProtocols: ["openai-compatible", "ollama"] as const,
    configFormat: "json" as const,
    notes: ["使用 OpenAI SDK 时需设置 api_key 与 base_url（兼容网关）。"]
  },
  {
    id: "cursor",
    name: "Cursor",
    category: "editor" as const,
    supportedProtocols: ["openai-compatible"] as const,
    configFormat: "text" as const,
    notes: ["在 Cursor 设置中将 OpenAI API Key / Override Base URL 指向兼容端点。", "重复的 /v1 常导致 404。"]
  },
  {
    id: "cline-roo",
    name: "Cline / Roo Code",
    category: "editor" as const,
    supportedProtocols: ["openai-compatible"] as const,
    configFormat: "text" as const,
    notes: ["在扩展设置中选择 OpenAI Compatible，填写 Base URL（通常含 /v1）与 API Key。", "模型名填网关返回的模型 ID。"]
  },
  {
    id: "continue",
    name: "Continue",
    category: "editor" as const,
    supportedProtocols: ["openai-compatible"] as const,
    configFormat: "json" as const,
    notes: ["在 config.json / UI 中为模型条目设置 apiKey、默认 completion endpoint。"]
  },
  {
    id: "cherry-studio",
    name: "Cherry Studio",
    category: "desktop-client" as const,
    supportedProtocols: ["openai-compatible"] as const,
    configFormat: "text" as const,
    notes: ["在模型提供商中选择 OpenAI 兼容，填写接口地址与密钥。", "部分版本字段名略有差异，以软件内文案为准。"]
  },
  {
    id: "custom-openai-compatible",
    name: "自定义 OpenAI Compatible 客户端",
    category: "custom" as const,
    supportedProtocols: ["openai-compatible", "ollama"] as const,
    configFormat: "text" as const,
    notes: ["任何支持 OpenAI Chat Completions schema 的工具均可套用下方 Base URL 与 Bearer 示例。"]
  }
] as const;

/** Provider 静态画像（与知识库条目独立；可选与已保存 Provider 合并）。 */
export const INTEGRATION_PROFILES = [
  {
    id: "generic-openai-compatible",
    label: "OpenAI Compatible（通用接法）",
    protocol: "openai-compatible" as const,
    defaultBaseUrl: "https://example.com/v1",
    authType: "bearer" as const,
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    envNames: ["OPENAI_API_KEY"],
    modelNameRule: "填服务商文档中的模型 ID（模型名称）；若网关有路由别名，以其控制台为准。",
    defaultModelPlaceholder: "your-model-id",
    capabilityHints: ["Chat Completions（聊天接口）", "部分网关支持 Models List（模型列表接口）"],
    pitfalls: [
      "Base URL（接口根地址）常需包含 /v1；不要把完整 …/chat/completions 当成 Base URL。",
      "避免重复的 /v1/v1。"
    ]
  },
  {
    id: "openai",
    label: "OpenAI",
    protocol: "openai-compatible" as const,
    defaultBaseUrl: "https://api.openai.com/v1",
    authType: "bearer" as const,
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    envNames: ["OPENAI_API_KEY"],
    modelNameRule: "使用 OpenAI 模型名（Model Name），例如 gpt-4o、gpt-4o-mini；以账户可用模型为准。",
    defaultModelPlaceholder: "gpt-4o-mini",
    capabilityHints: ["官方 Chat Completions（聊天接口）", "其它能力需要对应 endpoint（接口地址）"],
    pitfalls: ["账号需要有可用额度；密钥需要有调用所选模型的权限。"]
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    protocol: "openai-compatible" as const,
    defaultBaseUrl: "https://api.deepseek.com/v1",
    authType: "bearer" as const,
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    envNames: ["DEEPSEEK_API_KEY"],
    modelNameRule: "使用 DeepSeek API 文档中的模型名（Model Name），例如 deepseek-chat。",
    defaultModelPlaceholder: "deepseek-chat",
    capabilityHints: ["OpenAI 兼容 Chat（聊天接口）", "其它能力按平台说明填写"],
    pitfalls: ["密钥地区与网络策略可能影响连通性。", "中转服务可能改写路径，需按其说明配置 Base URL。"]
  },
  {
    id: "gemini",
    label: "Google Gemini（AI Studio REST）",
    protocol: "gemini" as const,
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    authType: "api-key-header" as const,
    authHeaderName: "x-goog-api-key",
    authHeaderTemplate: "x-goog-api-key: YOUR_API_KEY",
    envNames: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    modelNameRule: "填写 Gemini 模型 id（模型名称），例如 gemini-2.0-flash；以 Google AI Studio 文档为准。",
    defaultModelPlaceholder: "gemini-2.0-flash",
    capabilityHints: ["generateContent REST（Google 生成接口）", "与 OpenAI SDK 默认 endpoint（接口地址）不同"],
    pitfalls: ["不是 OpenAI Compatible：不要把它当作 /v1 Base URL 使用。", "需注意地区与配额限制。"]
  },
  {
    id: "ollama",
    label: "Ollama",
    protocol: "ollama" as const,
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    authType: "none" as const,
    authHeaderName: "",
    authHeaderTemplate: "（默认无需 API Key；若前置反向代理要求 Bearer，按代理说明填写）",
    envNames: [],
    modelNameRule: "填写本机已通过 ollama pull 的模型名（Model Name），或使用 ollama list 中出现的名称。",
    defaultModelPlaceholder: "llama3",
    capabilityHints: ["本地推理", "/v1/chat/completions 兼容层", "原生 /api/version、/api/tags"],
    pitfalls: ["若端口或主机不是 11434，请相应修改 Base URL（接口根地址）。", "防火墙或容器网络可能阻断连接。"]
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    protocol: "openai-compatible" as const,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    authType: "bearer" as const,
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    envNames: ["OPENROUTER_API_KEY"],
    modelNameRule: "使用 OpenRouter 路由名（模型名称，通常形如 vendor/model）；在控制台可查可用模型 slug。",
    defaultModelPlaceholder: "openrouter/auto",
    capabilityHints: ["聚合多厂商模型", "OpenAI Chat Completions 兼容"],
    pitfalls: ["可能产生跨厂商计费；请关注 OpenRouter 侧用量与限速。", "部分模型需额外申请或付费。"]
  },
  {
    id: "siliconflow",
    label: "SiliconFlow（硅基流动）",
    protocol: "openai-compatible" as const,
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    authType: "bearer" as const,
    authHeaderName: "Authorization",
    authHeaderTemplate: "Bearer YOUR_API_KEY",
    envNames: ["SILICONFLOW_API_KEY"],
    modelNameRule: "使用 SiliconFlow 控制台提供的模型全称或 API 文档中的 stable id。",
    defaultModelPlaceholder: "Qwen/Qwen2.5-7B-Instruct",
    capabilityHints: ["OpenAI Chat Completions 兼容"],
    pitfalls: ["网络与区域可能影响延迟；密钥权限需覆盖所选模型。"]
  }
] as const;

export type IntegrationTarget = (typeof INTEGRATION_TARGETS)[number];
export type IntegrationProfile = (typeof INTEGRATION_PROFILES)[number];

const PROFILE_MAP = Object.fromEntries(INTEGRATION_PROFILES.map((p) => [p.id, p])) as Record<string, IntegrationProfile>;
const TARGET_MAP = Object.fromEntries(INTEGRATION_TARGETS.map((t) => [t.id, t])) as Record<string, IntegrationTarget>;

export function findProfile(id: string): IntegrationProfile | undefined {
  return PROFILE_MAP[id];
}

export function findTarget(id: string): IntegrationTarget | undefined {
  return TARGET_MAP[id];
}

function snippetForTarget(
  profile: IntegrationProfile,
  target: IntegrationTarget,
  baseUrl: string,
  model: string
): { title: string; body: string; format: string } {
  const keyPlaceholder = "YOUR_API_KEY";
  const isGemini = profile.protocol === "gemini";
  const chatPath = isGemini ? `（Gemini：使用 generateContent，非单一 OpenAI chat path）` : `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  switch (target.id) {
    case "curl":
      if (profile.protocol === "gemini") {
        return {
          title: "curl（Gemini generateContent）",
          format: "bash",
          body: `# GEMINI示例：请将 MODEL 替换为模型 id
curl -s "${baseUrl.replace(/\/$/, "")}/models/MODEL:generateContent" \\
  -H "Content-Type: application/json" \\
  -H "x-goog-api-key: ${keyPlaceholder}" \\
  -d '{"contents":[{"parts":[{"text":"Hi"}]}],"generationConfig":{"maxOutputTokens":1,"temperature":0}}'`
        };
      }
      if (profile.protocol === "ollama") {
        return {
          title: "curl（Ollama OpenAI 兼容 chat）",
          format: "bash",
          body: `curl -s "${baseUrl.replace(/\/$/, "")}/chat/completions" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${model}","messages":[{"role":"user","content":"Hi"}],"max_tokens":1,"temperature":0}'`
        };
      }
      return {
        title: "curl（OpenAI Compatible chat）",
        format: "bash",
        body: `curl -s "${baseUrl.replace(/\/$/, "")}/chat/completions" \\
  -H "Authorization: Bearer ${keyPlaceholder}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${model}","messages":[{"role":"user","content":"Hi"}],"max_tokens":1,"temperature":0}'`
      };

    case "openai-sdk":
      if (profile.protocol === "gemini") {
        return {
          title: "Gemini REST（请使用 Google 官方 Gemini SDK 或手写 HTTP）",
          format: "text",
          body: `本平台测试使用 generateContent REST。若在应用中使用 OpenAI SDK，请选择 OpenAI Compatible 协议的 Provider 画像。\nREST Base: ${baseUrl}\nHeader: x-goog-api-key`
        };
      }
      return {
        title: "OpenAI SDK（Python 示例）",
        format: "python",
        body: `from openai import OpenAI

client = OpenAI(
    api_key="${keyPlaceholder}",
    base_url="${baseUrl}"
)

resp = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Hi"}],
    max_tokens=1,
    temperature=0,
)
print(resp.choices[0].message.content)`
      };

    case "cursor":
      return {
        title: "Cursor 设置要点",
        format: "text",
        body: isGemini
          ? `Cursor 默认面向 OpenAI 兼容 / 官方 OpenAI。Gemini（generateContent）需使用支持 Gemini 的途径或中转，不能直接当作 OpenAI Base URL 使用。\n若使用 OpenAI Compatible 网关转发到 Gemini，则 Base URL / Key 填写该网关给出的值。\nGemini REST 根地址参考：${baseUrl}`
          : `1）打开 Cursor Settings → Models（或 Override OpenAI Base URL）。\n2）Base URL 填写：${baseUrl}\n3）API Key 填写服务商密钥。\n4）模型名填写：${model}\n路径提示：chat 接口一般为 ${chatPath}`
      };

    case "cline-roo":
      return {
        title: "Cline / Roo Code",
        format: "text",
        body: isGemini
          ? `Cline/Roo Code 通常为 OpenAI Compatible 接入。直接使用 Gemini REST 不适用；请改用兼容网关或通过支持 Gemini 的插件配置。\n参考 REST 根：${baseUrl}`
          : `1）选择 API Provider → OpenAI Compatible。\n2）Base URL：${baseUrl}\n3）API Key：${keyPlaceholder}\n4）Model：${model}\n5）若报错 404，检查是否多出或缺少 /v1。`
      };

    case "continue":
      if (profile.protocol === "gemini") {
        return {
          title: "Continue",
          format: "text",
          body: `Continue 主要对接 OpenAI 兼容或自带提供商。直接使用 Gemini REST 时请在 Continue 中选用支持 Gemini 的配置方式或 HTTP 网关。\nGemini REST 根：${baseUrl}\nx-goog-api-key: ${keyPlaceholder}\n模型：${model}`
        };
      }
      return {
        title: "Continue（config 片段示意）",
        format: "json",
        body: JSON.stringify(
          {
            title: `${profile.label}`,
            provider: "openai",
            model,
            apiKey: keyPlaceholder,
            apiBase: baseUrl.replace(/\/$/, "")
          },
          null,
          2
        )
      };

    case "cherry-studio":
      return {
        title: "Cherry Studio",
        format: "text",
        body: isGemini
          ? `在 Cherry Studio 中选择「Gemini」或支持 Google AI 的提供商类型。\nAPI Key：${keyPlaceholder}\nAPI Host / Base URL：${baseUrl}\n模型：${model}`
          : `在模型提供商中添加「OpenAI 兼容」。\nAPI 地址：${baseUrl}\nAPI Key：${keyPlaceholder}\n模型名称：${model}`
      };

    case "custom-openai-compatible":
    default:
      return {
        title: "自定义 OpenAI Compatible",
        format: "text",
        body: isGemini
          ? `非 OpenAI 协议。Gemini：` +
            `\n• Base URL: ${baseUrl}\n• Header x-goog-api-key: ${keyPlaceholder}\n• 模型参数见 generateContent 文档。`
          : `请在客户端填入：\n• Base URL: ${baseUrl}\n• Authorization: Bearer ${keyPlaceholder}\n• Model: ${model}\n• Chat path 一般为 /chat/completions（若以服务端文档为准另有规定则按其文档）。`
      };
  }
}

export type IntegrationRenderPayload = {
  profileId: string;
  targetId: string;
  providerId?: string;
  baseUrl?: string | null;
  modelName?: string | null;
};

export type IntegrationRenderResult = {
  profile: IntegrationProfile;
  target: IntegrationTarget;
  resolvedBaseUrl: string;
  resolvedModelName: string;
  authType: string;
  authHeaderName: string;
  authHeaderTemplate: string;
  envExample: string;
  modelNameRule: string;
  softwareConfigSnippet: { title: string; format: string; body: string };
  curlExample: string;
  warnings: string[];
  knownPitfalls: string[];
  commonErrorsMerged: Array<{ error: string; reason?: string | null; solution?: string | null }>;
  suggestedTestTypes: Array<{ id: string; label: string; protocol: IntegrationProfile["protocol"] }>;
};

/** OpenAI Compatible 低成本探测：内容与 max_tokens 由后端钳制，避免误传超大输出。 */
export function getOpenAiCompatibleChatPayload(
  testType: "chat" | "chat-min" | "code-min" | "json-min",
  model: string,
  requestedMax: number
): { model: string; messages: Array<{ role: "user"; content: string }>; temperature: number; max_tokens: number } {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  let max_tokens: number;
  let content: string;
  switch (testType) {
    case "chat-min":
      max_tokens = clamp(requestedMax, 4, 8);
      content = "Reply with exactly: ok";
      break;
    case "code-min":
      max_tokens = clamp(requestedMax, 8, 16);
      content = "Return only a JavaScript function name for adding two numbers. Single word only.";
      break;
    case "json-min":
      max_tokens = clamp(requestedMax, 12, 24);
      content = 'Return only JSON: {"ok":true}';
      break;
    default:
      max_tokens = clamp(requestedMax, 1, 16);
      content = "Hi";
      break;
  }
  return { model, messages: [{ role: "user", content }], temperature: 0, max_tokens };
}

export async function buildIntegrationRender(prisma: PrismaClient, input: IntegrationRenderPayload): Promise<IntegrationRenderResult> {
  const profile = findProfile(input.profileId);
  if (!profile) {
    throw new Error("未知 profileId");
  }
  const target = findTarget(input.targetId);
  if (!target) {
    throw new Error("未知 targetId");
  }

  let resolvedBaseUrl = (input.baseUrl?.trim() || profile.defaultBaseUrl).trim();
  let resolvedModel =
    input.modelName?.trim() ||
    profile.defaultModelPlaceholder ||
    "";

let mergedCommonErrors: IntegrationRenderResult["commonErrorsMerged"] = [];

  if (input.providerId) {
    const p = await prisma.provider.findUnique({
      where: { id: input.providerId },
      include: { models: true, commonErrors: true }
    });
    if (p) {
      if (!input.baseUrl?.trim() && p.baseUrl?.trim()) {
        resolvedBaseUrl = p.baseUrl.trim();
      }
      if (!input.modelName?.trim() && p.models.length > 0) {
        const first = p.models.find((m) => m.name);
        if (first?.name) resolvedModel = first.name;
      }
      mergedCommonErrors = (p.commonErrors ?? []).map((e) => ({
        error: e.error,
        reason: e.reason,
        solution: e.solution
      }));
    }
  }

  if (!/^https?:\/\//i.test(resolvedBaseUrl)) {
    throw new Error("Base URL 必须为 http/https 绝对地址");
  }

  try {
    // eslint-disable-next-line no-new
    new URL(resolvedBaseUrl);
  } catch {
    throw new Error("Base URL 格式不正确");
  }

  const snippet = snippetForTarget(profile, target, resolvedBaseUrl, resolvedModel || "your-model-id");
  const withSlash = resolvedBaseUrl.replace(/\/$/, "");

  const curlBlock =
    profile.protocol === "gemini"
      ? `curl -s "${withSlash}/models/${resolvedModel || "MODEL"}:generateContent" \\
  -H "Content-Type: application/json" \\
  -H "x-goog-api-key: YOUR_API_KEY" \\
  -d '{"contents":[{"parts":[{"text":"Hi"}]}],"generationConfig":{"maxOutputTokens":1,"temperature":0}}'`
      : profile.protocol === "ollama"
        ? `curl -s "${withSlash}/chat/completions" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${resolvedModel || "MODEL"}","messages":[{"role":"user","content":"Hi"}],"max_tokens":1,"temperature":0}'`
        : `curl -s "${withSlash}/chat/completions" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${resolvedModel || "MODEL"}","messages":[{"role":"user","content":"Hi"}],"max_tokens":1,"temperature":0}'`;

  const envLines =
    profile.envNames.length > 0
      ? profile.envNames.map((n) => `${n}=YOUR_API_KEY`).join("\n")
      : profile.protocol === "ollama"
        ? "# Ollama 本地默认可不设 Key"
        : `# 按服务商文档设置密钥环境变量`;

  const warnings = [
    "以下示例中的 YOUR_API_KEY 请替换为你的真实密钥，勿提交到仓库或分享给他人。",
    "接入第三方或中转平台可能产生计费，请在服务商控制台核对价格与配额。",
    profile.protocol === "gemini"
      ? "Gemini 使用 generateContent REST，与 OpenAI Chat Completions 路径不同。"
      : "若客户端报 404 / 401，优先检查 Base URL 是否多出或缺少路径段（如 /v1）。",
    ...(target.notes ?? [])
  ];

  const knownPitfalls = [...profile.pitfalls];

  let suggestedTestTypes: IntegrationRenderResult["suggestedTestTypes"];
  if (profile.protocol === "gemini") {
    suggestedTestTypes = [{ id: "gemini", label: "Gemini · 最小生成 (generateContent)", protocol: profile.protocol }];
  } else if (profile.protocol === "ollama") {
    suggestedTestTypes = [
      { id: "ollama", label: "Ollama · 连通 + 最小 Chat", protocol: profile.protocol },
      { id: "models", label: "OpenAI 兼容 · 模型列表 GET", protocol: profile.protocol },
      { id: "chat-min", label: "最小对话 (chat-min)", protocol: profile.protocol },
      { id: "code-min", label: "最小编程回复 (code-min)", protocol: profile.protocol },
      { id: "json-min", label: "最小 JSON (json-min)", protocol: profile.protocol }
    ];
  } else {
    suggestedTestTypes = [
      { id: "models", label: "模型列表 (models)", protocol: profile.protocol },
      { id: "chat", label: "简单对话 (chat)", protocol: profile.protocol },
      { id: "chat-min", label: "最小对话 (chat-min)", protocol: profile.protocol },
      { id: "code-min", label: "最小编程回复 (code-min)", protocol: profile.protocol },
      { id: "json-min", label: "最小 JSON (json-min)", protocol: profile.protocol }
    ];
  }

  return {
    profile,
    target,
    resolvedBaseUrl: withSlash,
    resolvedModelName: resolvedModel,
    authType: profile.authType,
    authHeaderName: profile.authHeaderName,
    authHeaderTemplate: profile.authHeaderTemplate,
    envExample: envLines,
    modelNameRule: profile.modelNameRule,
    softwareConfigSnippet: { title: snippet.title, format: snippet.format, body: snippet.body },
    curlExample: curlBlock,
    warnings,
    knownPitfalls,
    commonErrorsMerged: [
      ...mergedCommonErrors,
      ...profile.pitfalls.map((solution) => ({ error: `${profile.label}（内置提示）`, reason: null, solution }))
    ],
    suggestedTestTypes
  };
}
