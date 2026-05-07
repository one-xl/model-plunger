import React from "react";
import { flushSync } from "react-dom";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import "./index.css";

const API_BASE = "/api";
const client = new QueryClient();

type QuickFix = {
  id: string;
  label: string;
  description: string;
  patch: {
    baseUrl?: string;
    model?: string;
    testType?: ProviderProbeType;
    apiKeyAction?: "replace" | "trim";
  };
};
type ApiErrorWithData = Error & { hints?: string[]; result?: any };

function ApiErrorText({ err }: { err: Error }) {
  const hints = (err as ApiErrorWithData).hints;
  const result = (err as ApiErrorWithData).result;
  return (
    <>
      <div className="text-sm">{err.message}</div>
      {result?.diagnosis ? (
        <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm leading-relaxed text-red-800">
          <div className="font-semibold">{result.diagnosis.reason ?? result.diagnosis.type}</div>
          <div>{result.diagnosis.suggestion}</div>
        </div>
      ) : null}
      {hints != null && hints.length > 0 ? (
        <ul className="mt-2 list-inside list-disc font-mono text-xs leading-relaxed text-slate-700">{hints.map((h, i) => <li key={`${i}-${h.slice(0, 40)}`}>{h}</li>)}</ul>
      ) : null}
    </>
  );
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    const e = new Error(data.message ?? data.result?.diagnosis?.reason ?? "Request failed") as ApiErrorWithData;
    if (Array.isArray(data.hints) && data.hints.every((x: unknown) => typeof x === "string")) {
      e.hints = data.hints;
    }
    if (data.result) e.result = data.result;
    throw e;
  }
  return data as T;
}

async function fetchKnowledgeExport() {
  const res = await fetch(`${API_BASE}/knowledge/export`);
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.message ?? "导出失败");
  return data as {
    formatVersion: number;
    exportedAt: string;
    providerCount?: number;
    providers: unknown[];
  };
}

async function postKnowledgeImport(payload: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/knowledge/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) {
    const issues = Array.isArray(data.issues) ? data.issues.map((x: { path?: unknown; message?: string }) => x.message ?? "").join("; ") : "";
    throw new Error([data.message ?? "导入失败", issues].filter(Boolean).join(" "));
  }
  if (data.ok === false) throw new Error(data.message ?? "导入失败");
  return data as { imported: number; failed: number; errors?: string[]; message?: string; mode?: string };
}

const card = "ui-card p-5 md:p-6";
const input = "ui-input";
const linkText = "text-teal-700 hover:text-teal-800 hover:underline transition-colors font-medium";
const btnPrimary = "btn-primary text-white";
const button = "ui-button";
const tabInactive = `${button} tab-button text-slate-900`;
const tabActive = `${button} tab-button tab-button-active`;
const textarea = "ui-textarea";
const labelClass = "ui-label";

const navItems: Array<{ to: string; label: string; end?: boolean }> = [
  { to: "/", label: "首页", end: true },
  { to: "/add-doc", label: "解析文档网址" },
  { to: "/providers", label: "接入知识库" },
  { to: "/connect", label: "一键测试接口" },
  { to: "/compare", label: "平台对比" },
  { to: "/doc-check", label: "文档更新检测" },
  { to: "/test-records", label: "测试记录" },
  { to: "/settings", label: "设置" }
] as const;

function MpBillingNotice({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`mp-callout-hazard rounded-lg border border-amber-200/90 bg-gradient-to-r from-amber-50 via-amber-50/95 to-orange-50/75 px-3 py-2.5 text-amber-950 ${className}`}
      role="note"
    >
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-900/85">费用与 token（用量）</div>
      <div className="mt-1.5 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

/** 对齐《易用化计划》：选择 → 生成配置片段 → 可复制并做最小成本测试。 */
function ConnectStepRail({ phase }: { phase: 1 | 2 | 3 }) {
  const steps: Array<{ n: 1 | 2 | 3; t: string }> = [
    { n: 1, t: "选择平台画像、目标软件；可选关联知识库以合并模型与文档" },
    { n: 2, t: "生成 Base URL、鉴权、环境变量、软件配置片段与 curl" },
    { n: 3, t: "复制配置后发起测试——会调用真实模型接口（可能计费）" }
  ];
  return (
    <ol className="mp-step-rail mb-4 grid gap-2 sm:grid-cols-3">
      {steps.map((s) => (
        <li
          key={s.n}
          className={`flex gap-2.5 rounded-xl border p-2.5 sm:min-h-[5rem] ${
            phase === s.n ? "border-teal-400/80 bg-teal-50/95 shadow-sm ring-1 ring-teal-200/90" : "border-slate-200/85 bg-white/70"
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-slate-950">{s.n}</span>
          <span className="text-xs font-medium leading-snug text-slate-800">{s.t}</span>
        </li>
      ))}
    </ol>
  );
}

function PlungerMark({ animated = false, intro = false }: { animated?: boolean; intro?: boolean }) {
  const cls = animated
    ? "plunger-bob h-16 w-16"
    : `${intro ? "plunger-mark" : ""} h-10 w-10 shrink-0`;
  return (
    <img
      src="/favicon.svg"
      alt="Model Plunger 站点图标"
      className={cls}
    />
  );
}

/** 与后端 Zod schema 对齐的草稿类型（表单编辑用）。 */
type AnalysisDraft = {
  provider: { name: string | null; officialWebsite: string | null; docsUrl: string | null; description: string | null };
  compatibility: { isOpenAICompatible: boolean | null; compatibleLevel: string; evidence: string | null; notes: string | null };
  auth: { type: string; headerName: string | null; headerValueTemplate: string | null; envNames: string[]; notes: string | null };
  endpoints: { baseUrl: string | null; chatCompletions: string | null; embeddings: string | null; models: string | null };
  models: Array<{
    name: string | null;
    type: string;
    contextWindow: number | null;
    maxOutputTokens: number | null;
    supportsStreaming: boolean | null;
    supportsVision: boolean | null;
    supportsTools: boolean | null;
    supportsJsonMode: boolean | null;
    notes: string | null;
  }>;
  minimalRequests: { chat: { method: string | null; url: string | null; headers: Record<string, unknown>; body: Record<string, unknown> }; modelsList: { method: string | null; url: string | null; headers: Record<string, unknown> } };
  codeExamples: { curl: string | null; python: string | null; javascript: string | null };
  commonErrors: Array<{ error: string | null; reason: string | null; solution: string | null }>;
  limits: { rateLimit: string | null; quota: string | null; notes: string | null };
  clientConfigGuide: ClientConfigGuide;
  analysisMeta: { confidence: number; unknownFields: string[]; warnings: string[]; sourceUrls: string[] };
};

type ClientGuideItem = { provider: string | null; baseUrl: string | null; apiKey: string | null; model: string | null; notes: string[] };
type ClientConfigGuide = {
  providerTypeToChoose: string;
  baseUrlToFill: string | null;
  apiKeyFieldInstruction: string | null;
  modelNameInstruction: string | null;
  chatEndpointFullUrl: string | null;
  modelsEndpointFullUrl: string | null;
  shouldUserIncludeV1: boolean | null;
  shouldUserIncludeChatCompletions: boolean | null;
  shouldUserIncludeFullEndpoint: boolean | null;
  baseUrlExplanation: string | null;
  endpointExplanation: string | null;
  beginnerSummary: string | null;
  commonMistakes: string[];
  copyableConfig: { provider: string | null; baseUrl: string | null; apiKey: string | null; model: string | null };
  clientSpecificGuides: Record<"cursor" | "trae" | "cline" | "continue" | "kiloCode" | "codexCli" | "chatbox" | "cherryStudio", ClientGuideItem>;
};

const clientGuideNames: Array<[keyof ClientConfigGuide["clientSpecificGuides"], string]> = [
  ["cursor", "Cursor"],
  ["trae", "Trae"],
  ["cline", "Cline"],
  ["continue", "Continue"],
  ["kiloCode", "Kilo Code"],
  ["codexCli", "Codex CLI"],
  ["chatbox", "Chatbox"],
  ["cherryStudio", "Cherry Studio"]
];

function cloneDraft(a: AnalysisDraft): AnalysisDraft {
  return structuredClone(a);
}

function textOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function boolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function normalizeClientConfigGuide(raw: unknown, baseUrl: string | null, firstModel: string | null, isOpenAICompatible: boolean | null): ClientConfigGuide {
  const r = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const copyRaw = typeof r.copyableConfig === "object" && r.copyableConfig !== null && !Array.isArray(r.copyableConfig) ? (r.copyableConfig as Record<string, unknown>) : {};
  const provider = textOrNull(r.providerTypeToChoose) ?? (isOpenAICompatible ? "OpenAI Compatible" : "Unknown");
  const copyable = {
    provider: textOrNull(copyRaw.provider) ?? provider,
    baseUrl: textOrNull(copyRaw.baseUrl) ?? textOrNull(r.baseUrlToFill) ?? baseUrl,
    apiKey: textOrNull(copyRaw.apiKey) ?? "YOUR_API_KEY",
    model: textOrNull(copyRaw.model) ?? firstModel ?? "按文档填写模型名"
  };
  const clientRaw = typeof r.clientSpecificGuides === "object" && r.clientSpecificGuides !== null && !Array.isArray(r.clientSpecificGuides)
    ? (r.clientSpecificGuides as Record<string, unknown>)
    : {};
  const guideItem = (key: string): ClientGuideItem => {
    const item = typeof clientRaw[key] === "object" && clientRaw[key] !== null && !Array.isArray(clientRaw[key]) ? (clientRaw[key] as Record<string, unknown>) : {};
    return {
      provider: textOrNull(item.provider) ?? copyable.provider,
      baseUrl: textOrNull(item.baseUrl) ?? copyable.baseUrl,
      apiKey: textOrNull(item.apiKey) ?? "YOUR_API_KEY",
      model: textOrNull(item.model) ?? copyable.model,
      notes: stringList(item.notes)
    };
  };
  return {
    providerTypeToChoose: provider,
    baseUrlToFill: textOrNull(r.baseUrlToFill) ?? baseUrl,
    apiKeyFieldInstruction: textOrNull(r.apiKeyFieldInstruction) ?? "把平台后台生成的 API Key 填到软件的 API Key / Key / Token 输入框。",
    modelNameInstruction: textOrNull(r.modelNameInstruction) ?? (firstModel ? `可先使用模型名：${firstModel}` : "按文档复制完整模型名，不要自己简写。"),
    chatEndpointFullUrl: textOrNull(r.chatEndpointFullUrl),
    modelsEndpointFullUrl: textOrNull(r.modelsEndpointFullUrl),
    shouldUserIncludeV1: boolOrNull(r.shouldUserIncludeV1),
    shouldUserIncludeChatCompletions: boolOrNull(r.shouldUserIncludeChatCompletions) ?? false,
    shouldUserIncludeFullEndpoint: boolOrNull(r.shouldUserIncludeFullEndpoint) ?? false,
    baseUrlExplanation: textOrNull(r.baseUrlExplanation) ?? "Base URL 是软件要填写的接口根地址，OpenAI Compatible 平台通常填到 /v1 即可。",
    endpointExplanation: textOrNull(r.endpointExplanation) ?? "Endpoint 是软件在 Base URL 后自动拼接的接口路径，例如 /chat/completions。",
    beginnerSummary: textOrNull(r.beginnerSummary) ?? "Provider 选 OpenAI Compatible，Base URL 通常填到 /v1 即可，不要手动添加 /chat/completions。",
    commonMistakes: stringList(r.commonMistakes).length ? stringList(r.commonMistakes) : ["把完整 /chat/completions 填进 Base URL。", "漏写或重复写 /v1。", "模型名没有按文档完整复制。"],
    copyableConfig: copyable,
    clientSpecificGuides: {
      cursor: guideItem("cursor"),
      trae: guideItem("trae"),
      cline: guideItem("cline"),
      continue: guideItem("continue"),
      kiloCode: guideItem("kiloCode"),
      codexCli: guideItem("codexCli"),
      chatbox: guideItem("chatbox"),
      cherryStudio: guideItem("cherryStudio")
    }
  };
}

/** 补齐缺失字段，防止 AI 返回不完整 JSON 导致表单报错。 */
function normalizeAnalysisDraft(raw: Record<string, unknown>): AnalysisDraft {
  const src = raw as Partial<AnalysisDraft>;
  const compLevel = ["full", "partial", "no", "unknown"].includes(String(src.compatibility?.compatibleLevel))
    ? String(src.compatibility!.compatibleLevel)
    : "unknown";
  const authType = ["bearer", "x-api-key", "query-key", "basic", "custom", "unknown"].includes(String(src.auth?.type))
    ? String(src.auth!.type)
    : "unknown";

  const modelsRaw = Array.isArray(src.models) ? src.models : [];

  const mapModelRow = (m: Record<string, unknown>) => ({
    name: typeof m.name === "string" || m.name === null ? m.name ?? null : null,
    type: ["chat", "reasoning", "embedding", "vision", "image", "audio", "rerank", "unknown"].includes(String(m.type))
      ? String(m.type)
      : "unknown",
    contextWindow: typeof m.contextWindow === "number" ? m.contextWindow : null,
    maxOutputTokens: typeof m.maxOutputTokens === "number" ? m.maxOutputTokens : null,
    supportsStreaming: typeof m.supportsStreaming === "boolean" ? m.supportsStreaming : null,
    supportsVision: typeof m.supportsVision === "boolean" ? m.supportsVision : null,
    supportsTools: typeof m.supportsTools === "boolean" ? m.supportsTools : null,
    supportsJsonMode: typeof m.supportsJsonMode === "boolean" ? m.supportsJsonMode : null,
    notes: typeof m.notes === "string" || m.notes === null ? m.notes ?? null : null
  });

  const firstModel = modelsRaw.find((x) => typeof x === "object" && x !== null && typeof (x as Record<string, unknown>).name === "string") as Record<string, unknown> | undefined;
  const normalizedBaseUrl = src.endpoints?.baseUrl ?? null;
  const normalizedCompatible = typeof src.compatibility?.isOpenAICompatible === "boolean" ? src.compatibility.isOpenAICompatible : null;

  return {
    provider: {
      name: src.provider?.name ?? null,
      officialWebsite: src.provider?.officialWebsite ?? null,
      docsUrl: src.provider?.docsUrl ?? null,
      description: src.provider?.description ?? null
    },
    compatibility: {
      isOpenAICompatible: typeof src.compatibility?.isOpenAICompatible === "boolean" ? src.compatibility.isOpenAICompatible : null,
      compatibleLevel: compLevel,
      evidence: src.compatibility?.evidence ?? null,
      notes: src.compatibility?.notes ?? null
    },
    auth: {
      type: authType,
      headerName: src.auth?.headerName ?? null,
      headerValueTemplate: src.auth?.headerValueTemplate ?? null,
      envNames: Array.isArray(src.auth?.envNames) ? (src.auth!.envNames as string[]).filter((x): x is string => typeof x === "string") : [],
      notes: src.auth?.notes ?? null
    },
    endpoints: {
      baseUrl: src.endpoints?.baseUrl ?? null,
      chatCompletions: src.endpoints?.chatCompletions ?? null,
      embeddings: src.endpoints?.embeddings ?? null,
      models: src.endpoints?.models ?? null
    },
    models: modelsRaw.filter((x) => typeof x === "object" && x !== null).map((x) => mapModelRow(x as Record<string, unknown>)),
    minimalRequests: {
      chat: {
        method: src.minimalRequests?.chat?.method ?? null,
        url: src.minimalRequests?.chat?.url ?? null,
        headers:
          typeof src.minimalRequests?.chat?.headers === "object" &&
          src.minimalRequests?.chat?.headers !== null &&
          !Array.isArray(src.minimalRequests.chat.headers)
            ? (src.minimalRequests!.chat!.headers as Record<string, unknown>)
            : {},
        body:
          typeof src.minimalRequests?.chat?.body === "object" &&
          src.minimalRequests?.chat?.body !== null &&
          !Array.isArray(src.minimalRequests.chat.body)
            ? (src.minimalRequests!.chat!.body as Record<string, unknown>)
            : {}
      },
      modelsList: {
        method: src.minimalRequests?.modelsList?.method ?? null,
        url: src.minimalRequests?.modelsList?.url ?? null,
        headers:
          typeof src.minimalRequests?.modelsList?.headers === "object" &&
          src.minimalRequests?.modelsList?.headers !== null &&
          !Array.isArray(src.minimalRequests.modelsList.headers)
            ? (src.minimalRequests!.modelsList!.headers as Record<string, unknown>)
            : {}
      }
    },
    codeExamples: {
      curl: src.codeExamples?.curl ?? null,
      python: src.codeExamples?.python ?? null,
      javascript: src.codeExamples?.javascript ?? null
    },
    commonErrors: Array.isArray(src.commonErrors)
      ? (src.commonErrors as unknown[])
          .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null && !Array.isArray(e))
          .map((e) => ({
            error: typeof e.error === "string" || e.error === null ? e.error ?? null : null,
            reason: typeof e.reason === "string" || e.reason === null ? e.reason ?? null : null,
            solution: typeof e.solution === "string" || e.solution === null ? e.solution ?? null : null
          }))
      : [],
    limits: {
      rateLimit: src.limits?.rateLimit ?? null,
      quota: src.limits?.quota ?? null,
      notes: src.limits?.notes ?? null
    },
    clientConfigGuide: normalizeClientConfigGuide(src.clientConfigGuide, normalizedBaseUrl, textOrNull(firstModel?.name), normalizedCompatible),
    analysisMeta: {
      confidence:
        typeof src.analysisMeta?.confidence === "number" && Number.isFinite(src.analysisMeta.confidence)
          ? Math.min(100, Math.max(0, src.analysisMeta.confidence))
          : 0,
      unknownFields: Array.isArray(src.analysisMeta?.unknownFields)
        ? (src.analysisMeta!.unknownFields as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      warnings: Array.isArray(src.analysisMeta?.warnings)
        ? (src.analysisMeta!.warnings as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      sourceUrls: Array.isArray(src.analysisMeta?.sourceUrls)
        ? (src.analysisMeta!.sourceUrls as unknown[]).filter((x): x is string => typeof x === "string")
        : []
    }
  };
}

function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

function FieldCopyRow({ label, value }: { label: string; value: React.ReactNode }) {
  const text = value == null ? "" : String(value);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-800">{label}</div>
        <button type="button" className={`${button} min-h-0 border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-slate-50`} onClick={() => copyText(text)}>
          复制
        </button>
      </div>
      <div className="break-all font-mono text-sm text-slate-950 ">{text || "未明确"}</div>
    </div>
  );
}

function CopyableConfigCard({ guide }: { guide: ClientConfigGuide }) {
  const cfg = guide.copyableConfig;
  const fullJson = JSON.stringify({ provider: cfg.provider, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model }, null, 2);
  const envText = `PROVIDER=${cfg.provider ?? ""}\nBASE_URL=${cfg.baseUrl ?? ""}\nAPI_KEY=${cfg.apiKey ?? "YOUR_API_KEY"}\nMODEL=${cfg.model ?? ""}`;
  return (
    <div className={`${card} border-blue-500/20`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-base font-bold text-slate-950 flex items-center gap-2">
          <span className="text-blue-600">📋</span> 一键复制配置
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${button} border-slate-200 bg-white text-xs text-slate-950 hover:bg-slate-50`} onClick={() => copyText(fullJson)}>复制 JSON</button>
          <button type="button" className={`${button} border-slate-200 bg-white text-xs text-slate-950 hover:bg-slate-50`} onClick={() => copyText(envText)}>复制 .env</button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <FieldCopyRow label="Provider" value={cfg.provider} />
        <FieldCopyRow label="Base URL" value={cfg.baseUrl} />
        <FieldCopyRow label="API Key" value={cfg.apiKey ?? "YOUR_API_KEY"} />
        <FieldCopyRow label="Model" value={cfg.model} />
      </div>
    </div>
  );
}

function BeginnerGuideCard({ guide }: { guide: ClientConfigGuide }) {
  const yn = (v: boolean | null) => (v === null ? "未明确" : v ? "要" : "不要");
  return (
    <div className={`${card} border-teal-500/20`}>
      <div className="mb-4 text-base font-bold text-slate-950 flex items-center gap-2">
        <span className="text-teal-700">💡</span> 小白填写指南
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <FieldCopyRow label="推荐 Provider 类型" value={guide.providerTypeToChoose} />
        <FieldCopyRow label="Base URL 应该填什么" value={guide.baseUrlToFill} />
        <FieldCopyRow label="API Key 应该填哪里" value={guide.apiKeyFieldInstruction} />
        <FieldCopyRow label="Model Name 应该填什么" value={guide.modelNameInstruction} />
        <FieldCopyRow label="完整 Chat URL" value={guide.chatEndpointFullUrl} />
        <FieldCopyRow label="/v1 要不要包含" value={yn(guide.shouldUserIncludeV1)} />
        <FieldCopyRow label="/chat/completions 要不要手动填" value={yn(guide.shouldUserIncludeChatCompletions)} />
        <FieldCopyRow label="是否填写完整 endpoint" value={yn(guide.shouldUserIncludeFullEndpoint)} />
      </div>
      <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium leading-relaxed text-teal-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">{guide.beginnerSummary}</div>
      {guide.commonMistakes.length > 0 ? (
        <ul className="mt-4 list-inside list-disc space-y-1 text-sm font-medium leading-relaxed text-slate-900">
          {guide.commonMistakes.map((m, i) => <li key={`${i}-${m.slice(0, 24)}`}>{m}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function SoftwareGuidesCard({ guide }: { guide: ClientConfigGuide }) {
  const [tab, setTab] = React.useState<keyof ClientConfigGuide["clientSpecificGuides"]>("cursor");
  const row = guide.clientSpecificGuides[tab];
  return (
    <div className={`${card} border-purple-500/20`}>
      <div className="mb-4 text-base font-bold text-slate-950 flex items-center gap-2">
        <span className="text-purple-600">🚀</span> 软件填写指南
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {clientGuideNames.map(([key, label]) => (
          <button key={key} type="button" className={tab === key ? tabActive : tabInactive} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <FieldCopyRow label="Provider 选什么" value={row.provider} />
        <FieldCopyRow label="Base URL 填什么" value={row.baseUrl} />
        <FieldCopyRow label="API Key 填什么" value={row.apiKey ?? "YOUR_API_KEY"} />
        <FieldCopyRow label="Model Name 填什么" value={row.model} />
      </div>
      <ul className="mt-4 list-inside list-disc space-y-1 text-sm font-medium text-slate-900">
        {(row.notes.length ? row.notes : ["没有特别规则时，按通用 OpenAI Compatible 配置填写。"]).map((n, i) => <li key={i}>{n}</li>)}
      </ul>
    </div>
  );
}

function ErrorCorrectionPanel({
  result,
  onApply
}: {
  result: any;
  onApply: (patch: QuickFix["patch"]) => void;
}) {
  const fixes: QuickFix[] = Array.isArray(result?.diagnosis?.quickFixes) ? result.diagnosis.quickFixes : [];
  if (!result || result.success || fixes.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-950">
      <div className="font-semibold">一键纠错</div>
      <p className="mt-1 text-xs leading-relaxed text-amber-900">
        下面是根据 HTTP {result.httpStatus ?? "错误"} 和返回内容推出来的候选修复。点一下会先改输入框，再重新点测试。
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {fixes.map((fix) => (
          <button
            key={fix.id}
            type="button"
            className={`${button} bg-white text-amber-950`}
            title={fix.description}
            onClick={() => onApply(fix.patch)}
          >
            {fix.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AnalysisFieldEditor({ draft, onChange }: { draft: AnalysisDraft; onChange: (next: AnalysisDraft) => void }) {
  const mrSerialized = JSON.stringify(draft.minimalRequests);
  const [minimalRequestsText, setMinimalRequestsText] = React.useState(() =>
    JSON.stringify(draft.minimalRequests, null, 2)
  );
  const [minimalRequestsError, setMinimalRequestsError] = React.useState<string | null>(null);
  const minimalRequestsTextRef = React.useRef(minimalRequestsText);
  minimalRequestsTextRef.current = minimalRequestsText;

  React.useEffect(() => {
    setMinimalRequestsText(JSON.stringify(draft.minimalRequests, null, 2));
    setMinimalRequestsError(null);
  }, [mrSerialized]);

  const applyMinimalRequestsSlice = React.useCallback(() => {
    try {
      const parsed = JSON.parse(minimalRequestsText);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setMinimalRequestsError("minimalRequests 必须是 JSON 对象");
        return;
      }
      const next = normalizeAnalysisDraft({
        ...(draft as unknown as Record<string, unknown>),
        minimalRequests: parsed
      });
      setMinimalRequestsError(null);
      onChange(next);
      setMinimalRequestsText(JSON.stringify(next.minimalRequests, null, 2));
    } catch (e) {
      setMinimalRequestsError((e as Error).message || "JSON 解析失败");
    }
  }, [draft, minimalRequestsText, onChange]);

  const patch = React.useCallback(
    (mutate: (d: AnalysisDraft) => void) => {
      let base = cloneDraft(draft);
      try {
        const parsed = JSON.parse(minimalRequestsTextRef.current);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          base = normalizeAnalysisDraft({
            ...(base as unknown as Record<string, unknown>),
            minimalRequests: parsed
          });
        }
      } catch {
        /* 解析失败时保留草稿中原有的 minimalRequests */
      }
      mutate(base);
      onChange(base);
    },
    [draft, onChange]
  );

  const compatBoolStr = draft.compatibility.isOpenAICompatible === null ? "" : draft.compatibility.isOpenAICompatible ? "true" : "false";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Provider（平台信息）</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelClass}>平台名称</label>
            <input className={input} value={draft.provider.name ?? ""} onChange={(e) => patch((d) => { d.provider.name = e.target.value || null; })} />
          </div>
          <div>
            <label className={labelClass}>官方网站</label>
            <input className={input} value={draft.provider.officialWebsite ?? ""} onChange={(e) => patch((d) => { d.provider.officialWebsite = e.target.value || null; })} />
          </div>
          <div>
            <label className={labelClass}>文档 URL（接入教程链接）</label>
            <input className={input} value={draft.provider.docsUrl ?? ""} onChange={(e) => patch((d) => { d.provider.docsUrl = e.target.value || null; })} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>描述</label>
            <textarea className={textarea} value={draft.provider.description ?? ""} onChange={(e) => patch((d) => { d.provider.description = e.target.value || null; })} rows={2} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">兼容性（能不能按 OpenAI 的方式接）</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelClass}>OpenAI Compatible（是否支持 OpenAI 常见接法）</label>
            <select
              className={input}
              value={compatBoolStr}
              onChange={(e) =>
                patch((d) => {
                  const v = e.target.value;
                  d.compatibility.isOpenAICompatible = v === "" ? null : v === "true";
                })
              }
            >
              <option value="">未知</option>
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Compatible Level（适配程度）</label>
            <select className={input} value={draft.compatibility.compatibleLevel} onChange={(e) => patch((d) => { d.compatibility.compatibleLevel = e.target.value; })}>
              <option value="unknown">unknown（不确定）</option>
              <option value="full">full（基本一样）</option>
              <option value="partial">partial（有些不同）</option>
              <option value="no">no（不支持）</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>证据 / 备注</label>
            <textarea className={textarea} value={draft.compatibility.evidence ?? ""} onChange={(e) => patch((d) => { d.compatibility.evidence = e.target.value || null; })} rows={2} placeholder="evidence" />
          </div>
          <div className="md:col-span-2">
            <textarea className={textarea} value={draft.compatibility.notes ?? ""} onChange={(e) => patch((d) => { d.compatibility.notes = e.target.value || null; })} rows={2} placeholder="notes" />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">鉴权（密钥怎么填）</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelClass}>鉴权类型（密钥填写方式）</label>
            <select className={input} value={draft.auth.type} onChange={(e) => patch((d) => { d.auth.type = e.target.value; })}>
              <option value="unknown">unknown（不确定）</option>
              <option value="bearer">bearer（放在 Authorization 里）</option>
              <option value="x-api-key">x-api-key（放在 x-api-key 里）</option>
              <option value="query-key">query-key（拼在链接参数里）</option>
              <option value="basic">basic（账号密码方式）</option>
              <option value="custom">custom（特殊写法）</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Header 名称（密钥栏名称）</label>
            <input className={input} value={draft.auth.headerName ?? ""} onChange={(e) => patch((d) => { d.auth.headerName = e.target.value || null; })} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Header 值模板（密钥填写格式，例如 Bearer `{"{"}API_KEY{"}"}`）</label>
            <input className={input} value={draft.auth.headerValueTemplate ?? ""} onChange={(e) => patch((d) => { d.auth.headerValueTemplate = e.target.value || null; })} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>环境变量名（推荐保存密钥的变量名，逗号分隔）</label>
            <input
              className={input}
              value={draft.auth.envNames.join(", ")}
              onChange={(e) =>
                patch((d) => {
                  d.auth.envNames = e.target.value
                    .split(/[,，]/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                })
              }
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>备注</label>
            <textarea className={textarea} value={draft.auth.notes ?? ""} onChange={(e) => patch((d) => { d.auth.notes = e.target.value || null; })} rows={2} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Endpoint（接口地址）</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(["baseUrl", "chatCompletions", "embeddings", "models"] as const).map((key) => (
            <div key={key} className={key === "baseUrl" ? "md:col-span-2" : ""}>
              <label className={labelClass}>{key === "baseUrl" ? "Base URL（接口根地址）" : key === "chatCompletions" ? "Chat Completions（聊天接口地址）" : key === "embeddings" ? "Embeddings（向量接口地址）" : "Models List（模型列表地址）"}</label>
              <input
                className={input}
                value={draft.endpoints[key] ?? ""}
                onChange={(e) => patch((d) => { d.endpoints[key] = e.target.value || null; })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">模型列表</span>
          <button
            type="button"
            className={`${button} bg-slate-100 text-slate-800`}
            onClick={() =>
              patch((d) => {
                d.models.push({
                  name: "",
                  type: "chat",
                  contextWindow: null,
                  maxOutputTokens: null,
                  supportsStreaming: null,
                  supportsVision: null,
                  supportsTools: null,
                  supportsJsonMode: null,
                  notes: null
                });
              })
            }
          >
            添加一行
          </button>
        </div>
        <div className="space-y-3">
          {draft.models.length === 0 && <p className="text-sm text-slate-700">暂无模型，可点击「添加一行」。</p>}
          {draft.models.map((row, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-2 rounded-md border border-slate-100 bg-slate-50 p-2 md:grid-cols-12">
              <div className="md:col-span-4">
                <label className={labelClass}>模型名</label>
                <input
                  className={input}
                  value={row.name ?? ""}
                  onChange={(e) => patch((d) => { d.models[idx].name = e.target.value || null; })}
                />
              </div>
              <div className="md:col-span-3">
                <label className={labelClass}>类型</label>
                <select className={input} value={row.type} onChange={(e) => patch((d) => { d.models[idx].type = e.target.value; })}>
                  {["chat", "reasoning", "embedding", "vision", "image", "audio", "rerank", "unknown"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-5 flex items-end justify-end">
                <button type="button" className={`${button} text-red-600`} onClick={() => patch((d) => { d.models.splice(idx, 1); })}>删除</button>
              </div>
              <div className="md:col-span-12">
                <label className={labelClass}>备注</label>
                <input className={input} value={row.notes ?? ""} onChange={(e) => patch((d) => { d.models[idx].notes = e.target.value || null; })} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">代码示例</div>
        {(["curl", "python", "javascript"] as const).map((lang) => (
          <div key={lang} className="mb-3">
            <label className={labelClass}>{lang}</label>
            <textarea
              className={textarea}
              rows={4}
              value={draft.codeExamples[lang] ?? ""}
              onChange={(e) => patch((d) => { d.codeExamples[lang] = e.target.value || null; })}
            />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">常见错误</span>
          <button type="button" className={`${button} bg-slate-100`} onClick={() => patch((d) => { d.commonErrors.push({ error: "", reason: null, solution: null }); })}>添加</button>
        </div>
        {draft.commonErrors.map((err, idx) => (
          <div key={idx} className="mb-3 grid gap-2 rounded-md border border-slate-100 p-2 md:grid-cols-12">
            <div className="md:col-span-11 grid gap-2 md:grid-cols-3">
              <input className={input} placeholder="error 标识" value={err.error ?? ""} onChange={(e) => patch((d) => { d.commonErrors[idx].error = e.target.value || null; })} />
              <input className={input} placeholder="原因" value={err.reason ?? ""} onChange={(e) => patch((d) => { d.commonErrors[idx].reason = e.target.value || null; })} />
              <input className={input} placeholder="解决方案" value={err.solution ?? ""} onChange={(e) => patch((d) => { d.commonErrors[idx].solution = e.target.value || null; })} />
            </div>
            <div className="flex items-end justify-end md:col-span-1">
              <button type="button" className="text-sm text-red-600" onClick={() => patch((d) => { d.commonErrors.splice(idx, 1); })}>删</button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">限制与元信息</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelClass}>速率限制说明</label>
            <input className={input} value={draft.limits.rateLimit ?? ""} onChange={(e) => patch((d) => { d.limits.rateLimit = e.target.value || null; })} />
          </div>
          <div>
            <label className={labelClass}>配额说明</label>
            <input className={input} value={draft.limits.quota ?? ""} onChange={(e) => patch((d) => { d.limits.quota = e.target.value || null; })} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>限制备注</label>
            <textarea className={textarea} value={draft.limits.notes ?? ""} onChange={(e) => patch((d) => { d.limits.notes = e.target.value || null; })} rows={2} />
          </div>
          <div>
            <label className={labelClass}>分析置信度 (0–100)</label>
            <input
              type="number"
              min={0}
              max={100}
              className={input}
              value={draft.analysisMeta.confidence}
              onChange={(e) =>
                patch((d) => {
                  const n = Number(e.target.value);
                  d.analysisMeta.confidence = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
                })
              }
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>未确认字段 unknownFields（每行一条）</label>
            <textarea
              className={textarea}
              rows={3}
              value={draft.analysisMeta.unknownFields.join("\n")}
              onChange={(e) =>
                patch((d) => {
                  d.analysisMeta.unknownFields = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
                })
              }
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>warnings（每行一条）</label>
            <textarea
              className={textarea}
              rows={2}
              value={draft.analysisMeta.warnings.join("\n")}
              onChange={(e) =>
                patch((d) => {
                  d.analysisMeta.warnings = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
                })
              }
            />
          </div>
        </div>
      </div>

      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-700">
          minimalRequests（JSON，可折叠）
        </summary>
        <p className="mt-2 text-xs text-slate-600">
          仍可与「JSON 源码」标签互通；此处为合法 JSON 时，修改上方其它表单字段也会一并合并进草稿。失焦或点击下方按钮校验并写入。
        </p>
        {minimalRequestsError ? (
          <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{minimalRequestsError}</div>
        ) : null}
        <textarea
          className={`${input} mt-2 h-48 font-mono`}
          spellCheck={false}
          value={minimalRequestsText}
          onChange={(e) => {
            setMinimalRequestsText(e.target.value);
            setMinimalRequestsError(null);
          }}
          onBlur={applyMinimalRequestsSlice}
        />
        <button type="button" className={`${button} mt-2 bg-slate-100 text-slate-800`} onClick={applyMinimalRequestsSlice}>
          应用 minimalRequests
        </button>
      </details>
    </div>
  );
}

function shell(children: React.ReactNode) {
  return (
    <div className="app-shell pb-20 lg:pb-0">
      <div className="mx-auto grid min-h-screen max-w-[1500px] gap-6 px-4 py-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:px-6">
        
        {/* Desktop Sidebar */}
        <header className="hidden lg:flex flex-col relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-xl backdrop-blur-xl lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] z-10">
          <div className="plunger-run pointer-events-none absolute top-3 opacity-20" aria-hidden="true">
            <PlungerMark animated />
          </div>
          <div className="relative flex items-center gap-4">
            <div className="bg-teal-500/20 p-2 rounded-2xl shadow-[0_0_15px_rgba(20,184,166,0.5)]">
              <PlungerMark intro />
            </div>
            <div>
              <div className="font-display text-xl font-black leading-tight tracking-tight text-slate-950 ">模型马桶塞</div>
              <div className="text-xs font-bold text-teal-700 uppercase tracking-widest mt-1">Model Plunger</div>
            </div>
          </div>
          
          <nav className="relative mt-8 flex flex-col gap-2" aria-label="Primary">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                className={({ isActive }) => `nav-pill ${isActive ? "nav-pill-active" : ""}`}
                end={item.end}
                to={item.to}
              >
                <span className="w-full text-left font-bold">{item.label}</span>
              </NavLink>
            ))}
          </nav>
          
          <div className="relative mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-900">
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-teal-500">理想路径</div>
            <ol className="mt-3 space-y-2 text-[11px] font-medium leading-snug">
              <li>① 粘贴陌生平台的在线文档</li>
              <li>② 生成小白填写指南</li>
              <li>③ 复制 Provider / Base URL</li>
              <li>④ 按软件查看 Cursor 等填法</li>
              <li>⑤ 一键测试接口是否接通</li>
              <li>⑥ 根据错误提示一键修正</li>
            </ol>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-teal-500/20 p-1.5 rounded-xl shadow-[0_0_15px_rgba(20,184,166,0.3)]">
              <PlungerMark intro />
            </div>
            <div>
              <div className="font-display text-lg font-black leading-tight tracking-tight text-slate-950">模型马桶塞</div>
              <div className="text-[10px] font-bold text-teal-700 uppercase tracking-widest">Model Plunger</div>
            </div>
          </div>
        </header>

        <main className="min-w-0 z-0">
          <div className="page-transition">{children}</div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-slate-200 bg-white/80 p-2 pb-4 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
        {navItems.slice(0, 5).map((item) => (
          <NavLink
            key={item.to}
            className={({ isActive }) => `nav-pill flex-1 text-center ${isActive ? "nav-pill-active" : ""}`}
            end={item.end}
            to={item.to}
          >
            <span className="text-[10px] font-bold mt-1 line-clamp-1">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api<{ stats: any }>("/stats")
  });
  const stats = data?.stats;
  return shell(
    <>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
        <div className={`${card} relative overflow-hidden bg-gradient-to-br from-teal-500/10 to-transparent border-teal-200`}>
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-teal-500/20 blur-3xl rounded-full"></div>
          <div className="relative z-10">
            <div className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Model Plunger</div>
            <h1 className="mt-3 font-display text-3xl font-black tracking-tight text-slate-950 md:text-5xl ">
              模型马桶塞
            </h1>
            <p className="mt-4 max-w-4xl text-base leading-relaxed text-slate-900 font-medium">
              把复杂的大模型 API 文档，翻译成 Cursor、Trae、Cline、Continue 等 AI 编程软件里能直接复制填写的 Provider、Base URL、API Key 和模型名。
            </p>
            <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50 px-5 py-3 text-sm font-bold text-teal-900 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
              哪里不通，捅哪里。专治 API 不通、URL 填错、模型名找不到。
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Link className={`${button} ${btnPrimary}`} to="/add-doc">解析文档网址</Link>
              <Link className={`${button}`} to="/connect">先测一个接口</Link>
              <Link className={`${button}`} to="/providers">查看接入知识库</Link>
            </div>
          </div>
        </div>

        <div className={`${card}`}>
          <div className="text-base font-bold text-slate-950 flex items-center gap-2">
            <span className="text-orange-600">⚠️</span> 最常见的堵点
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-900">
            <li className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 shadow-sm">Base URL 填成了完整 <code className="text-pink-600 bg-slate-50 px-1.5 py-0.5 rounded-md">/chat/completions</code>。</li>
            <li className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 shadow-sm">漏写或重复写了 <code className="text-pink-600 bg-slate-50 px-1.5 py-0.5 rounded-md">/v1</code>。</li>
            <li className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 shadow-sm">API Key 复制多了空格，或没有模型权限。</li>
            <li className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 shadow-sm">模型名自己简写，导致 <code className="text-pink-600 bg-slate-50 px-1.5 py-0.5 rounded-md">model not found</code>。</li>
          </ul>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className={card}>
          <div className="text-sm font-bold text-slate-950 uppercase tracking-wider">示例：小米 MiMo 这类文档</div>
          <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-4 font-mono text-xs leading-relaxed text-slate-900 shadow-sm">
            <span className="text-teal-700">Base URL:</span> https://xxx/v1<br />
            <span className="text-teal-700">Endpoint:</span> /chat/completions
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-800 font-medium">
            大多数软件只填 Base URL 到 <code className="text-slate-950">/v1</code>，不要把 <code className="text-slate-950">/chat/completions</code> 也塞进去。
          </p>
        </div>
        <div className={card}>
          <div className="text-sm font-bold text-slate-950 uppercase tracking-wider">输出什么</div>
          <dl className="mt-3 grid gap-3 text-sm">
            <div className="flex justify-between items-center gap-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 shadow-sm"><dt className="font-semibold text-slate-800">Provider</dt><dd className="font-mono text-xs text-slate-950">OpenAI Compatible</dd></div>
            <div className="flex justify-between items-center gap-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 shadow-sm"><dt className="font-semibold text-slate-800">Base URL</dt><dd className="font-mono text-xs text-slate-950">https://xxx/v1</dd></div>
            <div className="flex justify-between items-center gap-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 shadow-sm"><dt className="font-semibold text-slate-800">Model</dt><dd className="font-mono text-xs text-slate-950">按文档复制</dd></div>
          </dl>
        </div>
        <div className={card}>
          <div className="text-sm font-bold text-slate-950 uppercase tracking-wider">失败后怎么办</div>
          <p className="mt-3 text-sm leading-relaxed text-slate-800 font-medium">
            测试失败时会按 400、401、402、404、422 等状态分析原因，并给出 <strong className="text-teal-700">“一键纠错”</strong> 按钮，先改输入框，再由你决定是否重测。
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className={`${card} mp-stat-card border-t-2 border-t-purple-500`}>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-800">Providers</div>
          <div className="mp-stat-figure mt-1 text-4xl font-black text-slate-950 ">{stats?.providerCount ?? 0}</div>
          <div className="mt-1 text-xs text-slate-800 font-medium">已收录平台</div>
        </div>
        <div className={`${card} mp-stat-card border-t-2 border-t-teal-500`}>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-800">Docs</div>
          <div className="mp-stat-figure mt-1 text-4xl font-black text-slate-950 ">{stats?.analyzedDocCount ?? 0}</div>
          <div className="mt-1 text-xs text-slate-800 font-medium">已分析文档</div>
        </div>
        <div className={`${card} mp-stat-card border-t-2 border-t-pink-500`}>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-800">Tests</div>
          <div className="mp-stat-figure mt-1 text-4xl font-black text-slate-950 ">{stats?.testCount ?? 0}</div>
          <div className="mt-1 text-xs text-slate-800 font-medium">已发起测试</div>
        </div>
        <div className={`${card} mp-stat-card border-t-2 border-t-orange-500`}>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-800">Recent</div>
          {stats?.lastTestResult ? (
            <>
              <div
                className={`mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${
                  stats.lastTestResult.success ? "mp-status-success" : "mp-status-fail"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${stats.lastTestResult.success ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-rose-400 shadow-[0_0_8px_#fb7185]"}`} aria-hidden="true" />
                {stats.lastTestResult.success ? "成功" : "失败"}
              </div>
              <div className="mt-2 truncate text-sm font-bold text-slate-950 " title={stats.lastTestResult.providerName}>
                {stats.lastTestResult.providerName}
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm text-slate-800 font-medium">暂无测试</div>
          )}
        </div>
      </div>
    </>
  );
}

function AddDocPage() {
  const [url, setUrl] = React.useState("");
  const [providerName, setProviderName] = React.useState("");
  const [recursiveSameOrigin, setRecursiveSameOrigin] = React.useState(false);
  const [fromSitemap, setFromSitemap] = React.useState(false);
  const [fromGithubReadme, setFromGithubReadme] = React.useState(false);
  const [fromOpenApi, setFromOpenApi] = React.useState(false);
  const [maxPages, setMaxPages] = React.useState(10);
  const [doc, setDoc] = React.useState<any>(null);
  const [draftAnalysis, setDraftAnalysis] = React.useState<AnalysisDraft | null>(null);
  const [editorTab, setEditorTab] = React.useState<"form" | "json">("form");
  const [jsonText, setJsonText] = React.useState("");
  const [jsonApplyError, setJsonApplyError] = React.useState<string | null>(null);
  const navigate = useNavigate();
  const prevEditorTabRef = React.useRef<"form" | "json">(editorTab);

  React.useEffect(() => {
    const prev = prevEditorTabRef.current;
    if (prev === "form" && editorTab === "json" && draftAnalysis) {
      setJsonText(JSON.stringify(draftAnalysis, null, 2));
    }
    prevEditorTabRef.current = editorTab;
  }, [editorTab, draftAnalysis]);

  const fetchMutation = useMutation({
    mutationFn: () => {
      const trimmedProviderName = providerName.trim();
      return api<{ doc: any }>("/docs/fetch", {
        method: "POST",
        body: JSON.stringify({
          url,
          providerName: trimmedProviderName || undefined,
          recursiveSameOrigin,
          fromSitemap,
          fromGithubReadme,
          fromOpenApi,
          maxPages: Math.min(30, Math.max(1, maxPages))
        })
      });
    },
    onSuccess: (res) => setDoc(res.doc)
  });
  const analyzeMutation = useMutation({
    mutationFn: () =>
      api<{ analysis: Record<string, unknown> }>("/docs/analyze", {
        method: "POST",
        body: JSON.stringify({ url: doc.url, providerName: providerName.trim() || undefined, markdown: doc.markdown })
      }),
    onSuccess: (res) => {
      const normalized = normalizeAnalysisDraft(res.analysis);
      setDraftAnalysis(normalized);
      setJsonText(JSON.stringify(normalized, null, 2));
      setEditorTab("form");
      setJsonApplyError(null);
    }
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!doc) throw new Error("缺少文档内容");
      let analysisPayload: AnalysisDraft;
      try {
        if (editorTab === "json") {
          analysisPayload = normalizeAnalysisDraft(JSON.parse(jsonText) as Record<string, unknown>);
        } else {
          if (!draftAnalysis) throw new Error("缺少分析草稿");
          analysisPayload = draftAnalysis;
        }
      } catch (e) {
        throw new Error((e as Error).message ?? "解析分析数据失败");
      }
      return api<{ providerId: string }>("/providers", {
        method: "POST",
        body: JSON.stringify({
          analysis: analysisPayload,
          sourceMarkdown: doc.markdown,
          sourceUrl: doc.url,
          sourceTitle: doc.title
        })
      });
    },
    onSuccess: (res) => navigate(`/providers/${res.providerId}`)
  });

  function switchTab(next: "form" | "json") {
    if (next === "form" && editorTab === "json") {
      try {
        const parsed = JSON.parse(jsonText) as Record<string, unknown>;
        setDraftAnalysis(normalizeAnalysisDraft(parsed));
        setJsonApplyError(null);
      } catch {
        setJsonApplyError("无法切换到表单：请先修正 JSON");
        return;
      }
    }
    if (next === "json" && editorTab === "form") {
      flushSync(() => {
        const ae = document.activeElement as HTMLElement | undefined;
        ae?.blur?.();
      });
    }
    setEditorTab(next);
    if (next === "json") setJsonApplyError(null);
  }

  function prettifyJson() {
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      setJsonText(JSON.stringify(normalizeAnalysisDraft(parsed), null, 2));
      setJsonApplyError(null);
    } catch (e) {
      setJsonApplyError((e as Error).message || "JSON 解析失败");
    }
  }

  return shell(
    <div className="space-y-6">
      <div className={`${card} relative overflow-hidden bg-gradient-to-br from-purple-500/10 to-transparent border-purple-500/30`}>
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-purple-500/20 blur-3xl rounded-full pointer-events-none"></div>
        <div className="relative z-10">
          <div className="font-display text-2xl font-black text-slate-950 ">解析文档网址</div>
          <p className="mt-3 text-base leading-relaxed text-slate-900 font-medium">
            粘贴模型平台的官方接入文档、Quick Start、API Reference 或 OpenAI Compatible 说明页。不要贴控制台后台地址、登录后才能看的页面，抓取器读不到。
          </p>
          <div className="mt-5 grid gap-3 text-xs font-bold text-slate-800 md:grid-cols-3">
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 shadow-sm flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-500/20 text-teal-700">1</span> 抓取网页正文
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 shadow-sm flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-500/20 text-pink-600">2</span> AI 翻译成软件填写项
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 shadow-sm flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/20 text-orange-600">3</span> 保存到接入知识库
            </div>
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-base font-bold text-slate-950">文档来源</div>
          <button
            type="button"
            className={`${button} border-slate-200 bg-white text-xs text-slate-950 hover:bg-slate-50`}
            onClick={() => setUrl("https://platform.openai.com/docs/api-reference/chat/create")}
          >
            填入示例 URL
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>在线文档 URL</label>
            <input className={input} placeholder="例如官方 Quick Start / API Reference" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>平台名称（可选）</label>
            <input className={input} placeholder="例如 DeepSeek / OpenRouter" value={providerName} onChange={(e) => setProviderName(e.target.value)} />
          </div>
        </div>
        <div className="mt-5 grid gap-3 text-sm text-slate-900 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-slate-300 bg-slate-50 text-teal-500 focus:ring-teal-500/50"
              checked={recursiveSameOrigin}
              onChange={(e) => {
                setRecursiveSameOrigin(e.target.checked);
                if (e.target.checked) {
                  setFromSitemap(false);
                  setFromGithubReadme(false);
                  setFromOpenApi(false);
                }
              }}
            />
            <span className="font-medium">同站递归抓取（顺着同一个网站多抓几页）</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-slate-300 bg-slate-50 text-teal-500 focus:ring-teal-500/50"
              checked={fromSitemap}
              onChange={(e) => {
                setFromSitemap(e.target.checked);
                if (e.target.checked) {
                  setRecursiveSameOrigin(false);
                  setFromGithubReadme(false);
                  setFromOpenApi(false);
                }
              }}
            />
            <span className="font-medium">按 Sitemap 抓取（按网站目录抓取）</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-slate-300 bg-slate-50 text-teal-500 focus:ring-teal-500/50"
              checked={fromGithubReadme}
              onChange={(e) => {
                setFromGithubReadme(e.target.checked);
                if (e.target.checked) {
                  setRecursiveSameOrigin(false);
                  setFromSitemap(false);
                  setFromOpenApi(false);
                }
              }}
            />
            <span className="font-medium">GitHub README（抓说明页）</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-slate-300 bg-slate-50 text-teal-500 focus:ring-teal-500/50"
              checked={fromOpenApi}
              onChange={(e) => {
                setFromOpenApi(e.target.checked);
                if (e.target.checked) {
                  setRecursiveSameOrigin(false);
                  setFromSitemap(false);
                  setFromGithubReadme(false);
                }
              }}
            />
            <span className="font-medium">OpenAPI / Swagger JSON</span>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-3">
            <span className="text-slate-800 font-bold uppercase tracking-wider text-xs">最多页数（最多抓几页）</span>
            <input
              type="number"
              min={1}
              max={30}
              className={`${input} w-24`}
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value) || 1)}
              disabled={!recursiveSameOrigin && !fromSitemap}
            />
          </label>
        </div>
        <button type="button" className={`${button} mt-6 w-full md:w-auto ${btnPrimary}`} onClick={() => fetchMutation.mutate()}>抓取文档</button>
        {fetchMutation.isPending && <div className="mt-3 text-sm font-bold text-teal-700 animate-pulse">正在读取教程...</div>}
        {fetchMutation.error && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
            <ApiErrorText err={fetchMutation.error as Error} />
          </div>
        )}
      </div>

      {doc && (
        <div className={`${card} border-teal-500/20`}>
          <div className="text-base font-bold text-slate-950">抓取结果</div>
          <div className="mt-3 text-sm font-medium text-slate-900">标题：<span className="text-slate-950">{doc.title}</span></div>
          <div className="text-sm font-medium text-slate-900">文档 URL：<span className="text-slate-950">{doc.url}</span></div>
          <div className="text-sm font-medium text-slate-900">读到的内容长度：<span className="text-slate-950">{doc.textLength}</span></div>
          {doc.openApi ? (
            <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm">
              OpenAPI / Swagger：<span className="font-mono text-teal-700">{doc.openApi.variant}</span> → Markdown 摘要
            </div>
          ) : null}
          {doc.github ? (
            <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm">
              GitHub 说明页：<span className="font-mono text-teal-700">{doc.github.owner}/{doc.github.repo}</span>
            </div>
          ) : null}
          {doc.crawl && (
            <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 shadow-sm">
              <div className="font-bold text-slate-950">
                {doc.crawl.fromSitemap ? "Sitemap 抓取" : "递归抓取"}：已合并 {doc.crawl.fetchedPages} / 上限 {doc.crawl.maxPagesRequested} 页
              </div>
              {doc.crawl.fromSitemap && Array.isArray(doc.crawl.sitemapsFetched) ? (
                <div className="mt-2 text-teal-700">已解析 sitemap 文件：{doc.crawl.sitemapsFetched.length} 个</div>
              ) : null}
              <ul className="mt-2 max-h-40 list-inside list-disc overflow-y-auto space-y-1">
                {doc.crawl.pages.map((p: { url: string; title: string; textLength: number }) => (
                  <li key={p.url}>
                    {p.title} — {p.textLength} 字符 — <span className="break-all font-mono text-xs text-slate-800">{p.url}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <textarea className={`${input} mt-4 h-48 font-mono text-xs text-slate-800 leading-relaxed`} value={doc.markdown} onChange={(e) => setDoc({ ...doc, markdown: e.target.value, textLength: e.target.value.length })} placeholder="如果抓取到的内容太少（例如遇到了纯 JS 渲染的页面），您可以直接在这里粘贴文档原文后再点击分析..." />
          <button type="button" className={`${button} mt-5 w-full md:w-auto bg-gradient-to-r from-orange-500 to-pink-500 border-none shadow-[0_4px_15px_rgba(249,115,22,0.4)] text-white hover:from-orange-400 hover:to-pink-400`} onClick={() => analyzeMutation.mutate()}>AI 分析文档并提取接入步骤</button>
          {analyzeMutation.isPending && <div className="mt-3 text-sm font-bold text-orange-600 animate-pulse">正在整理接入步骤...</div>}
          {analyzeMutation.error && (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
              <ApiErrorText err={analyzeMutation.error as Error} />
            </div>
          )}
        </div>
      )}

      {draftAnalysis && (
        <div className="space-y-6">
          <BeginnerGuideCard guide={draftAnalysis.clientConfigGuide} />
          <CopyableConfigCard guide={draftAnalysis.clientConfigGuide} />
          <SoftwareGuidesCard guide={draftAnalysis.clientConfigGuide} />
          <div className={`${card} border-pink-500/20`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-base font-bold text-slate-950">分析结果（可校对后保存）</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={editorTab === "form" ? tabActive : tabInactive} onClick={() => switchTab("form")}>按项修改</button>
                <button type="button" className={editorTab === "json" ? tabActive : tabInactive} onClick={() => switchTab("json")}>JSON 源码</button>
              </div>
            </div>

            <p className="mt-3 text-sm text-slate-800 font-medium">上面的“小白填写指南”会优先展示给用户；这里保留原始字段编辑能力，避免破坏已有保存闭环。</p>
            {jsonApplyError && <div className="mt-3 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm font-bold text-orange-300">{jsonApplyError}</div>}

            {editorTab === "form" && (
              <div className="tab-panel mt-5">
                <AnalysisFieldEditor draft={draftAnalysis} onChange={setDraftAnalysis} />
              </div>
            )}

            {editorTab === "json" && (
              <div className="tab-panel mt-5 space-y-3">
                <div className="flex flex-wrap gap-3">
                  <button type="button" className={`${button} border-slate-200 bg-white hover:bg-slate-50`} onClick={prettifyJson}>校验并格式化</button>
                </div>
                <textarea className={`${input} mt-2 h-96 font-mono`} value={jsonText} spellCheck={false} onChange={(e) => { setJsonText(e.target.value); setJsonApplyError(null); }} />
              </div>
            )}

            <button type="button" className={`${button} mt-4 bg-green-600 text-white`} onClick={() => saveMutation.mutate()}>保存到知识库</button>
            {(saveMutation.error as Error | undefined)?.message && (
              <div className="mt-2 text-sm text-red-600">{(saveMutation.error as Error).message}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProvidersPage() {
  const [search, setSearch] = useSearchParams();
  const keyword = search.get("keyword") ?? "";
  const { data } = useQuery({
    queryKey: ["providers", keyword],
    queryFn: () => api<{ providers: any[] }>(`/providers?keyword=${encodeURIComponent(keyword)}`)
  });
  return shell(
    <div className="space-y-4">
      <div className={card}>
        <input
          className={input}
          placeholder="按平台名搜索"
          value={keyword}
          onChange={(e) => setSearch(e.target.value ? { keyword: e.target.value } : {})}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(data?.providers ?? []).map((p) => (
          <div className={card} key={p.id}>
            <div className="font-semibold">{p.name}</div>
            <div className="text-sm">Base URL: {p.baseUrl ?? "未在文档中明确找到"}</div>
            <div className="text-sm">OpenAI Compatible: {String(p.isOpenAICompatible)}</div>
            <div className="text-sm">模型数量: {p.models?.length ?? 0}</div>
            <div className="mt-2 flex gap-3 text-sm">
              <Link className={linkText} to={`/providers/${p.id}`}>查看详情</Link>
              <Link className={linkText} to={`/providers/${p.id}`}>一键测试</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function truncCell(s: string | null | undefined, max: number): string {
  if (s == null || !String(s).trim()) return "—";
  const t = String(s).trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function fmtBoolNullable(v: boolean | null | undefined): string {
  if (v === true) return "是";
  if (v === false) return "否";
  return "未知";
}

function ComparePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["providers", ""],
    queryFn: () => api<{ providers: any[] }>("/providers")
  });
  const rows = data?.providers ?? [];

  return shell(
    <div className="space-y-4">
      <div className={card}>
        <div className="text-sm font-semibold">平台对比</div>
        <p className="mt-1 text-xs text-slate-600">
          并列查看知识库中各平台的兼容程度、鉴权与接口字段（数据来源于保存时的分析结果）。点击平台名进入详情与一键测试。
        </p>
      </div>
      <div className={`${card} overflow-x-auto p-0`}>
        {isLoading ? (
          <div className="p-4 text-sm text-slate-700">加载中…</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-sm text-slate-600">暂无平台，请先到「添加文档 URL」录入或从「设置」导入知识库。</div>
        ) : (
          <table className="w-full min-w-[880px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="px-4 py-3">平台</th>
                <th className="px-3 py-3">OpenAI 兼容</th>
                <th className="px-3 py-3">兼容程度</th>
                <th className="px-3 py-3">Base URL</th>
                <th className="px-3 py-3">鉴权</th>
                <th className="px-3 py-3 text-right">模型数</th>
                <th className="px-4 py-3">文档</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                  <td className="px-4 py-2 font-medium">
                    <Link className={linkText} to={`/providers/${p.id}`}>
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{fmtBoolNullable(p.isOpenAICompatible)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{p.compatibleLevel ?? "—"}</td>
                  <td className="max-w-[14rem] px-3 py-2 font-mono text-xs" title={p.baseUrl ?? ""}>
                    {truncCell(p.baseUrl, 48)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{p.authType ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.models?.length ?? 0}</td>
                  <td className="px-4 py-2">
                    {p.docsUrl ? (
                      <a className={linkText} href={p.docsUrl} target="_blank" rel="noreferrer">
                        {truncCell(p.docsUrl, 28)}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function DocCheckPage() {
  const [diffDocId, setDiffDocId] = React.useState<string | null>(null);

  const checkMut = useMutation({
    mutationFn: () =>
      api<{
        checkedAt: string;
        summary: { total: number; changed: number; unchanged: number; errors: number };
        results: Array<{
          providerId: string;
          providerName: string;
          docId: string;
          url: string;
          storedHash: string;
          liveHash: string | null;
          changed: boolean | null;
          error?: string;
        }>;
      }>("/docs/check-updates", { method: "POST", body: JSON.stringify({}) })
  });

  const diffMut = useMutation({
    mutationFn: (docId: string) =>
      api<{
        docId: string;
        providerName: string;
        url: string;
        identical: boolean;
        markdownTruncated: boolean;
        unifiedDiff: string;
        unifiedDiffTruncated: boolean;
      }>("/docs/diff-versions", { method: "POST", body: JSON.stringify({ docId }) }),
    onMutate: (docId) => setDiffDocId(docId)
  });

  const { data, isPending, error } = checkMut;

  return shell(
    <div className="space-y-4">
      <div className={card}>
        <div className="text-sm font-semibold">文档更新检测</div>
        <p className="mt-1 text-xs text-slate-600">
          对知识库中每条已保存文档 URL 重新抓取并转为 Markdown，计算 SHA256 与入库时的 contentHash 比对；表格中「差异」可生成入库正文与实时抓取的 unified diff（不写库）。文档较多时检测会依次请求，请耐心等待。
        </p>
        <button
          type="button"
          className={`${button} mt-3 ${btnPrimary} disabled:opacity-50`}
          disabled={isPending}
          onClick={() => checkMut.mutate()}
        >
          {isPending ? "检测中…" : "检测全部文档"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{(error as Error).message}</p>}
      </div>

      {data && (
        <>
          <div className={card}>
            <div className="text-xs text-slate-700">检测时间（UTC）</div>
            <div className="mt-1 font-mono text-sm">{data.checkedAt}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <div><span className="text-slate-700">总计</span> <span className="font-semibold tabular-nums">{data.summary.total}</span></div>
              <div><span className="text-slate-700">有变化</span> <span className="font-semibold tabular-nums text-amber-700">{data.summary.changed}</span></div>
              <div><span className="text-slate-700">未变化</span> <span className="font-semibold tabular-nums text-green-700">{data.summary.unchanged}</span></div>
              <div><span className="text-slate-700">错误</span> <span className="font-semibold tabular-nums text-red-600">{data.summary.errors}</span></div>
            </div>
          </div>

          <div className={`${card} overflow-x-auto p-0`}>
            {data.results.length === 0 ? (
              <div className="p-4 text-sm text-slate-600">暂无已保存文档记录。</div>
            ) : (
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    <th className="px-4 py-3">平台</th>
                    <th className="px-3 py-3">状态</th>
                    <th className="px-4 py-3">文档 URL</th>
                    <th className="px-3 py-3 whitespace-nowrap">对比</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((r) => (
                    <tr key={r.docId} className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="px-4 py-2">
                        <Link className={`font-medium ${linkText}`} to={`/providers/${r.providerId}`}>
                          {r.providerName}
                        </Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.error ? (
                          <span className="text-red-600" title={r.error}>错误</span>
                        ) : r.changed ? (
                          <span className="text-amber-700">已变化</span>
                        ) : (
                          <span className="text-green-700">一致</span>
                        )}
                      </td>
                      <td className="max-w-[20rem] px-4 py-2 font-mono text-xs" title={r.url}>
                        <a className={linkText} href={r.url} target="_blank" rel="noreferrer">
                          {truncCell(r.url, 56)}
                        </a>
                        {r.error && <div className="mt-1 whitespace-normal text-red-600">{r.error}</div>}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <button
                          type="button"
                          className={`${button} bg-slate-100 text-slate-800 disabled:opacity-50`}
                          disabled={Boolean(r.error) || diffMut.isPending}
                          onClick={() => diffMut.mutate(r.docId)}
                        >
                          {diffMut.isPending && diffDocId === r.docId ? "加载…" : "差异"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {diffMut.error && (
            <div className={`${card} border-red-200 bg-red-50`}>
              <div className="text-sm font-semibold text-red-800">差异加载失败</div>
              <div className="mt-1 text-sm text-red-700">
                <ApiErrorText err={diffMut.error as Error} />
              </div>
            </div>
          )}

      {diffMut.data && (
            <div className={card}>
              <div className="text-sm font-semibold">Unified diff（入库 stored.md ↔ 实时抓取 live.md）</div>
              <p className="mt-1 text-xs text-slate-600">
                {diffMut.data.providerName} ·{" "}
                {diffMut.data.identical ? (
                  <span className="text-green-700">内容与哈希一致</span>
                ) : (
                  <span className="text-amber-700">存在差异</span>
                )}
                {diffMut.data.markdownTruncated ? " · 正文过长已截断后参与 diff" : ""}
                {diffMut.data.unifiedDiffTruncated ? " · diff 输出已截断" : ""}
              </p>
              <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre rounded-md border border-slate-200 bg-slate-900 p-3 text-xs text-slate-900">
                {diffMut.data.unifiedDiff.trim() || "（无行间差异）"}
              </pre>
            </div>
          )}
    </div>
  );
}

type ProviderProbeType = "chat" | "models" | "ollama" | "gemini" | "chat-min" | "code-min" | "json-min";

function ProviderDetailPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["provider", id],
    queryFn: () => api<{ provider: any }>(`/providers/${id}`)
  });
  const provider = data?.provider;
  const rawAnalysis = React.useMemo(() => {
    if (!provider?.rawAnalysisJson) return null;
    try {
      return normalizeAnalysisDraft(JSON.parse(provider.rawAnalysisJson) as Record<string, unknown>);
    } catch {
      return null;
    }
  }, [provider?.rawAnalysisJson]);
  const guide = rawAnalysis?.clientConfigGuide;
  const [showKey, setShowKey] = React.useState(false);
  const [apiKey, setApiKey] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [model, setModel] = React.useState("");
  const [testType, setTestType] = React.useState<ProviderProbeType>("chat-min");
  React.useEffect(() => {
    if (provider) {
      setBaseUrl(provider.baseUrl ?? "");
      setModel(provider.models?.[0]?.name ?? "");
    }
  }, [provider]);
  const testMutation = useMutation({
    mutationFn: () => {
      const maxTokens =
        testType === "json-min"
          ? 24
          : testType === "code-min"
            ? 16
            : testType === "chat-min"
              ? 8
              : 1;
      return api<{ result: any }>("/check/test", {
        method: "POST",
        body: JSON.stringify({ providerId: id, apiKey, baseUrl, model, testType, maxTokens, timeoutMs: 30000 })
      });
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["stats"] });
      await qc.invalidateQueries({ queryKey: ["records"] });
    }
  });
  const testResult = testMutation.data?.result ?? (testMutation.error as ApiErrorWithData | null)?.result;
  function applyQuickFix(patch: QuickFix["patch"]) {
    if (patch.baseUrl) setBaseUrl(patch.baseUrl);
    if (patch.model) setModel(patch.model);
    if (patch.testType) setTestType(patch.testType);
    if (patch.apiKeyAction === "trim") setApiKey((v) => v.trim());
  }
  return shell(
    <div className="space-y-4">
      <div className={card}>
        <div className="text-lg font-semibold">{provider?.name}</div>
        <div className="text-sm">文档来源：{provider?.docsUrl}</div>
        <div className="text-sm">定位：AI 编程软件模型接入参数翻译器 + 一键连通性检测器</div>
      </div>
      {guide ? (
        <>
          <BeginnerGuideCard guide={guide} />
          <CopyableConfigCard guide={guide} />
        </>
      ) : null}
      <div className={card}>
        <div className="mb-2 text-sm font-semibold">一键测试（测试能不能连上）</div>
        <div className="mb-3 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-950">
          通常情况下，Base URL 填到 /v1 即可，不要手动加 /chat/completions，除非你的软件要求完整接口。
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div>
            <input
              className={input}
              type={showKey ? "text" : "password"}
              placeholder={
                testType === "ollama"
                  ? "API Key（密钥，可选，本地 Ollama 可留空）"
                  : testType === "gemini"
                    ? "Gemini API Key（AI Studio 密钥）"
                    : "API Key（密钥）"
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button className={`mt-1 text-xs ${linkText}`} type="button" onClick={() => setShowKey(!showKey)}>{showKey ? "隐藏" : "显示"} API Key</button>
          </div>
          <input
            className={input}
            placeholder={testType === "gemini" ? "Base URL（接口根地址，默认 generativelanguage…/v1beta）" : "Base URL（接口根地址）"}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <input className={input} placeholder={testType === "gemini" ? "Model Name（模型名称，默认 gemini-2.0-flash）" : "Model Name（模型名称）"} value={model} onChange={(e) => setModel(e.target.value)} />
          <select
            className={input}
            value={testType}
            onChange={(e) => {
              const v = e.target.value as ProviderProbeType;
              setTestType(v);
              if (v === "gemini") {
                if (!baseUrl.trim()) setBaseUrl("https://generativelanguage.googleapis.com/v1beta");
                if (!model.trim()) setModel("gemini-2.0-flash");
              }
            }}
          >
            <option value="chat">chat（OpenAI 兼容）</option>
            <option value="chat-min">chat-min（低成本对话探测）</option>
            <option value="code-min">code-min（低成本代码类回复）</option>
            <option value="json-min">json-min（低成本 JSON 探测）</option>
            <option value="models">models（OpenAI 兼容）</option>
            <option value="ollama">ollama（/api/version + /api/tags + chat）</option>
            <option value="gemini">gemini（generateContent）</option>
          </select>
        </div>
        <MpBillingNotice className="mt-3">
          <>
            <strong className="font-semibold">计费提示：</strong>
            测试会请求真实模型 API，可能消耗 token（用量额度）或产生费用。建议优先使用 chat-min / code-min / json-min 等低输出探测。
          </>
        </MpBillingNotice>
        <button type="button" className={`${button} mt-3 ${btnPrimary}`} onClick={() => testMutation.mutate()}>测试连接</button>
        {testMutation.error && !testResult ? (
          <div className="mt-2 text-sm text-red-700">
            <ApiErrorText err={testMutation.error as Error} />
          </div>
        ) : null}
        {testResult && (
          <div className={`mt-3 rounded-md p-3 text-sm ${testResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            状态：{testResult.success ? "成功" : "失败"}，HTTP: {testResult.httpStatus ?? "-"}，耗时: {testResult.latencyMs}ms
            <div>诊断：{testResult.diagnosis?.reason} / {testResult.diagnosis?.suggestion}</div>
            {testResult.gemini ? (
              <div className="mt-2 text-xs">Gemini：`models/{testResult.gemini.model}:generateContent`</div>
            ) : null}
            {testResult.ollama?.detected ? (
              <div className="mt-2 text-xs">
                Ollama {testResult.ollama.version} · 模型数 {testResult.ollama.models?.length ?? 0}
                {testResult.ollama.serverRoot ? ` · 根 ${testResult.ollama.serverRoot}` : ""}
              </div>
            ) : null}
            <ErrorCorrectionPanel result={testResult} onApply={applyQuickFix} />
          </div>
        )}
      </div>
      {guide ? <SoftwareGuidesCard guide={guide} /> : null}
      <div className={card}>
        <div className="text-sm font-semibold">原始接口信息</div>
        <div className="mt-2 text-sm">Base URL（接口根地址）：{provider?.baseUrl ?? "未在文档中明确找到"}</div>
        <div className="text-sm">Chat Path（聊天接口路径）：{provider?.chatCompletionsPath ?? "未在文档中明确找到"}</div>
        <div className="text-sm">鉴权（密钥写法）：{provider?.authType ?? "未在文档中明确找到"}</div>
      </div>
      <div className={card}>
        <div className="text-sm font-semibold">模型列表</div>
        <ul className="mt-2 list-disc pl-5 text-sm">
          {(provider?.models ?? []).map((m: any) => <li key={m.id}>{m.name}</li>)}
        </ul>
      </div>
      {provider?.rawAnalysisJson ? (
        <div className={card}>
          <div className="text-sm font-semibold">JSON 原文</div>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs">{provider.rawAnalysisJson}</pre>
        </div>
      ) : null}
    </div>
  );
}

/** 表格展示后端 `usageSnapshot`（JSON）；尽量压缩为可读 token 摘要。 */
function formatTestUsagePreview(raw: string | null | undefined): string {
  if (raw == null || !String(raw).trim()) return "—";
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const total =
      typeof o.total_tokens === "number"
        ? o.total_tokens
        : typeof o.totalTokenCount === "number"
          ? o.totalTokenCount
          : undefined;
    const p =
      typeof o.prompt_tokens === "number"
        ? o.prompt_tokens
        : typeof o.promptTokenCount === "number"
          ? o.promptTokenCount
          : undefined;
    const c =
      typeof o.completion_tokens === "number"
        ? o.completion_tokens
        : typeof o.candidatesTokenCount === "number"
          ? o.candidatesTokenCount
          : undefined;
    if (total !== undefined) return `total=${total}`;
    if (p !== undefined || c !== undefined) return `prompt ${p ?? "?"}/${c ?? "?"} `;
    return `${raw.slice(0, 56)}…`;
  } catch {
    return `${raw.slice(0, 56)}…`;
  }
}

function TestRecordsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["records"],
    queryFn: () => api<{ records: any[] }>("/test-records")
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/test-records/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["records"] });
    }
  });
  return shell(
    <div className={card}>
      <table className="w-full text-left text-sm text-slate-900 font-medium">
        <thead>
          <tr className="border-b border-slate-300 text-slate-950 font-bold">
            <th className="py-2">时间</th><th>平台</th><th>Base URL</th><th>模型</th><th>状态</th><th>HTTP</th><th>耗时</th><th>用量快照</th><th>错误类型</th><th>建议</th><th></th>
          </tr>
        </thead>
        <tbody>
          {(data?.records ?? []).map((r) => (
            <tr key={r.id} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
              <td>{new Date(r.createdAt).toLocaleString()}</td>
              <td>{r.providerName}</td>
              <td>{r.baseUrlMasked}</td>
              <td>{r.modelName ?? "-"}</td>
              <td className={r.success ? "text-green-600" : "text-red-600"}>{r.success ? "成功" : "失败"}</td>
              <td>{r.httpStatus ?? "-"}</td>
              <td>{r.latencyMs}ms</td>
              <td className="max-w-[10rem] font-mono text-xs" title={(r.usageSnapshot as string | null | undefined) ?? ""}>{formatTestUsagePreview(r.usageSnapshot)}</td>
              <td>{r.errorType ?? "-"}</td>
              <td>{r.suggestion ?? "-"}</td>
              <td><button className="text-red-600" onClick={() => del.mutate(r.id)}>删除</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ settings: any }>("/settings")
  });
  const [importMode, setImportMode] = React.useState<"merge" | "replace">("merge");
  const [importHint, setImportHint] = React.useState<string | null>(null);
  const [importErr, setImportErr] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const exportMut = useMutation({
    mutationFn: fetchKnowledgeExport,
    onSuccess: (exported) => {
      const stamp = exported.exportedAt?.slice(0, 19).replace(/:/g, "-") ?? String(Date.now());
      const dl = JSON.stringify(
        {
          formatVersion: exported.formatVersion,
          exportedAt: exported.exportedAt,
          providers: exported.providers
        },
        null,
        2
      );
      const url = URL.createObjectURL(new Blob([dl], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `model-plunger-knowledge-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  });

  const importMut = useMutation({
    mutationFn: async ({ file, mode }: { file: File; mode: "merge" | "replace" }) => {
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      return postKnowledgeImport({
        ...raw,
        mode
      });
    },
    onSuccess: async (res) => {
      setImportErr(null);
      setImportHint(
        `${res.mode === "replace" ? "已清空并导入" : "合并导入"}：成功 ${res.imported}，失败 ${res.failed}${
          res.errors?.length ? `；明细：${res.errors.slice(0, 3).join(" | ")}` : ""
        }`
      );
      await qc.invalidateQueries({ queryKey: ["providers"] });
      await qc.invalidateQueries({ queryKey: ["stats"] });
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e: Error) => {
      setImportHint(null);
      setImportErr(e.message);
    }
  });

  const s = data?.settings;

  async function handleImportPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (importMode === "replace" && !confirm("替换模式会先删除数据库中已有全部平台，确定继续？")) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    importMut.mutate({ file, mode: importMode });
  }

  return shell(
    <div className="space-y-6">
      <div className={`${card} space-y-2 text-sm`}>
        <div className="text-sm font-semibold">文档分析模型 (.env)</div>
        <div>ANALYZER_BASE_URL: {s?.analyzerBaseUrlConfigured ? "已配置" : "未配置"}</div>
        <div>ANALYZER_API_KEY: {s?.analyzerApiKeyConfigured ? s?.analyzerApiKeyMasked : "未配置"}</div>
        <div>ANALYZER_MODEL: {s?.analyzerModel ?? "未配置"}</div>
        <div>GITHUB_TOKEN: {s?.githubTokenConfigured ? "已配置（README 抓取可提高 API 限额）" : "未配置"}</div>
      </div>

      <div className={card}>
        <div className="text-sm font-semibold">知识库备份（不含测试记录）</div>
        <p className="mt-1 text-xs text-slate-600">
          导出为 JSON（formatVersion = 1）。合并导入会追加记录并在 slug 冲突时自动更名；替换导入会清空现有平台后在单事务中写入。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={`${button} ${btnPrimary}`}
            disabled={exportMut.isPending}
            onClick={() => exportMut.mutate()}
          >
            {exportMut.isPending ? "导出中…" : "导出 JSON"}
          </button>
        </div>
        {exportMut.error && (
          <p className="mt-2 text-sm text-red-600">{(exportMut.error as Error).message}</p>
        )}
      </div>

      <div className={card}>
        <div className="text-sm font-semibold">从备份导入</div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className={labelClass}>导入模式</label>
            <select className={input} value={importMode} onChange={(e) => setImportMode(e.target.value as "merge" | "replace")}>
              <option value="merge">合并（追加，slug 冲突则变体）</option>
              <option value="replace">替换（先清空全部平台）</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>JSON 文件</label>
            <input ref={fileRef} className={`${input} max-w-xs`} type="file" accept=".json,application/json" onChange={handleImportPick} />
          </div>
        </div>
        {importMut.isPending && <p className="mt-2 text-sm text-teal-700">导入中…</p>}
        {importHint && <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{importHint}</p>}
        {importErr && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{importErr}</p>}
      </div>
    </div>
  );
}

type IntegrationTargetRow = {
  id: string;
  name: string;
  category: string;
  supportedProtocols: readonly string[];
  configFormat: string;
  notes: readonly string[];
};

type IntegrationProfileRow = {
  id: string;
  label: string;
  protocol: string;
  defaultBaseUrl: string;
  authType: string;
};

type IntegrationRenderResponse = {
  profileId: string;
  profileLabel: string;
  profileProtocol: string;
  targetId: string;
  targetName: string;
  resolvedBaseUrl: string;
  resolvedModelName: string;
  authType: string;
  authHeaderName: string;
  authHeaderTemplate: string;
  envExample: string;
  modelNameRule: string;
  capabilityHints: string[];
  softwareConfigSnippet: { title: string; format: string; body: string };
  curlExample: string;
  warnings: string[];
  knownPitfalls: string[];
  commonErrors: Array<{ error: string; reason?: string | null; solution?: string | null }>;
  suggestedTestTypes: Array<{ id: string; label: string }>;
};

function ConnectPage() {
  const qc = useQueryClient();
  const [profileId, setProfileId] = React.useState("generic-openai-compatible");
  const [targetId, setTargetId] = React.useState("cursor");
  const [kbProviderId, setKbProviderId] = React.useState("");
  const [baseUrlOverride, setBaseUrlOverride] = React.useState("");
  const [modelInput, setModelInput] = React.useState("");
  const [render, setRender] = React.useState<IntegrationRenderResponse | null>(null);
  const [apiKey, setApiKey] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [testType, setTestType] = React.useState<string>("chat-min");
  const [copyToast, setCopyToast] = React.useState<string | null>(null);

  const metaQuery = useQuery({
    queryKey: ["integrations-meta"],
    queryFn: async () => {
      const [tRes, pRes] = await Promise.all([
        api<{ targets: IntegrationTargetRow[] }>("/integrations/targets"),
        api<{ profiles: IntegrationProfileRow[] }>("/integrations/profiles")
      ]);
      return { targets: tRes.targets, profiles: pRes.profiles };
    }
  });

  const providersQuery = useQuery({
    queryKey: ["providers", ""],
    queryFn: () => api<{ providers: Array<{ id: string; name: string }> }>("/providers")
  });

  const detailQuery = useQuery({
    queryKey: ["provider", kbProviderId],
    queryFn: () => api<{ provider: { models: Array<{ id: string; name: string }> } }>(`/providers/${kbProviderId}`),
    enabled: Boolean(kbProviderId)
  });

  const renderMutation = useMutation({
    mutationFn: () =>
      api<{ render: IntegrationRenderResponse }>("/integrations/render", {
        method: "POST",
        body: JSON.stringify({
          profileId,
          targetId,
          providerId: kbProviderId || undefined,
          baseUrl: baseUrlOverride.trim() ? baseUrlOverride.trim() : undefined,
          modelName: modelInput.trim() ? modelInput.trim() : undefined
        })
      }),
    onSuccess: (data) => {
      setRender(data.render);
      setTestType(data.render.suggestedTestTypes[0]?.id ?? "chat-min");
      setCopyToast(null);
    }
  });

  React.useEffect(() => {
    if (!copyToast) return;
    const t = window.setTimeout(() => setCopyToast(null), 2000);
    return () => window.clearTimeout(t);
  }, [copyToast]);

  function copyToClipboard(label: string, text: string) {
    void navigator.clipboard.writeText(text).then(
      () => setCopyToast(`已复制：${label}`),
      () => setCopyToast("复制失败")
    );
  }

  const effectiveBase = baseUrlOverride.trim() || render?.resolvedBaseUrl || "";
  const effectiveModel = render?.resolvedModelName ?? modelInput.trim();

  const testMutation = useMutation({
    mutationFn: () => {
      if (!render && !effectiveBase) throw new Error("请先「生成接入配置」以确定 Base URL 与测试参数");
      const baseUrl = effectiveBase || baseUrlOverride.trim();
      if (!/^https?:\/\//i.test(baseUrl)) throw new Error("请填写合法的 Base URL");
      const mappedType =
        testType === "gemini" || testType === "ollama" || testType === "models" || testType === "chat"
          ? testType
          : ["chat-min", "code-min", "json-min"].includes(testType)
            ? testType
            : "chat-min";
      const maxTokens =
        mappedType === "json-min"
          ? 24
          : mappedType === "code-min"
            ? 16
            : mappedType === "chat-min"
              ? 8
              : 1;

      const body: Record<string, unknown> = {
        baseUrl,
        apiKey,
        model: effectiveModel || undefined,
        testType: mappedType,
        maxTokens,
        timeoutMs: 30000
      };
      if (kbProviderId) body.providerId = kbProviderId;
      return api<{
        ok: boolean;
        result: { success: boolean; httpStatus?: number | null; latencyMs: number; diagnosis?: { suggestion?: string; quickFixes?: QuickFix[] }; errorMessage?: string };
      }>("/check/test", { method: "POST", body: JSON.stringify(body) });
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["stats"] });
      await qc.invalidateQueries({ queryKey: ["records"] });
    }
  });

  const targets = metaQuery.data?.targets ?? [];
  const profiles = metaQuery.data?.profiles ?? [];
  const modelOptions = detailQuery.data?.provider?.models ?? [];
  const connectPhase: 1 | 2 | 3 = !render ? 1 : testMutation.data ? 3 : 2;
  const connectTestResult = testMutation.data?.result ?? (testMutation.error as ApiErrorWithData | null)?.result;
  function applyConnectQuickFix(patch: QuickFix["patch"]) {
    if (patch.baseUrl) setBaseUrlOverride(patch.baseUrl);
    if (patch.model) setModelInput(patch.model);
    if (patch.testType) setTestType(patch.testType);
    if (patch.apiKeyAction === "trim") setApiKey((v) => v.trim());
  }

  return shell(
    <div className="space-y-4">
      <ConnectStepRail phase={connectPhase} />
      <div className={`${card} mp-callout-wizard border`}>
        <div className="font-display text-base font-bold tracking-tight text-slate-900">接入向导</div>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          先选<strong className="text-slate-950">Provider（模型平台）和 Target（要接入的软件）</strong>，系统会整理出可复制的 Base URL（接口根地址）、鉴权（密钥写法）、模型名和 curl 测试命令。
          生成后请先读<strong className="text-amber-900">费用提示</strong>再测试。
        </p>
        {metaQuery.isError && <p className="mt-2 text-sm text-red-600">{(metaQuery.error as Error).message}</p>}
      </div>

      <div className={card}>
        <div className="mb-2 text-sm font-semibold">选择</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelClass}>Provider（模型平台）</label>
            <select className={input} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Target（接入目标软件）</label>
            <select className={input} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>知识库 Provider（可选，用来自动补全 URL / 模型 / 常见错误）</label>
            <select className={input} value={kbProviderId} onChange={(e) => setKbProviderId(e.target.value)}>
              <option value="">（不关联知识库）</option>
              {(providersQuery.data?.providers ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>覆盖 Base URL（可选，手动指定接口根地址）</label>
            <input className={input} value={baseUrlOverride} onChange={(e) => setBaseUrlOverride(e.target.value)} placeholder="不填则使用画像默认值或知识库值" />
          </div>
          <div>
            <label className={labelClass}>Model Name（模型名称，可选）</label>
            <input className={input} value={modelInput} onChange={(e) => setModelInput(e.target.value)} placeholder="不填则使用画像示例或知识库首条模型" />
          </div>
          {modelOptions.length > 0 ? (
            <div className="md:col-span-2">
              <label className={labelClass}>从知识库模型快捷填入</label>
              <select
                className={input}
                value=""
                onChange={(e) => {
                  if (e.target.value) setModelInput(e.target.value);
                }}
              >
                <option value="">选择一行…</option>
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <button type="button" className={`${button} mt-3 ${btnPrimary}`} onClick={() => renderMutation.mutate()} disabled={renderMutation.isPending}>
          {renderMutation.isPending ? "生成中…" : "生成接入配置"}
        </button>
        {renderMutation.error && (
          <div className="mt-2 text-sm text-red-600">
            <ApiErrorText err={renderMutation.error as Error} />
          </div>
        )}
        {copyToast ? <div className="mt-2 text-sm text-green-700">{copyToast}</div> : null}
      </div>

      {!render && (
        <div className={card}>
          <div className="text-sm font-semibold text-slate-900">快速连通测试</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            只想先测接口时，直接在上方填 Base URL 和 Model Name，再在这里填 API Key。通常 Base URL 填到 `/v1`，不要手动加 `/chat/completions`。
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <input
                className={input}
                type={showKey ? "text" : "password"}
                placeholder="API Key（不会保存到知识库）"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button type="button" className={`mt-1 text-xs ${linkText}`} onClick={() => setShowKey(!showKey)}>
                {showKey ? "隐藏" : "显示"}密钥
              </button>
            </div>
            <select className={input} value={testType} onChange={(e) => setTestType(e.target.value)}>
              <option value="chat-min">chat-min（推荐，最低成本）</option>
              <option value="models">models（只拉模型列表）</option>
              <option value="chat">chat（OpenAI 兼容）</option>
              <option value="gemini">gemini（generateContent）</option>
              <option value="ollama">ollama（本地服务）</option>
            </select>
          </div>
          <button type="button" className={`${button} mt-3 ${btnPrimary}`} onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
            {testMutation.isPending ? "测试中…" : "测试接口"}
          </button>
          {testMutation.error && !connectTestResult && (
            <div className="mt-2 text-sm text-red-700">
              <ApiErrorText err={testMutation.error as Error} />
            </div>
          )}
          {connectTestResult && (
            <div className={`mt-3 rounded-md p-3 text-sm ${connectTestResult.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              状态：{connectTestResult.success ? "成功" : "失败"} · HTTP {connectTestResult.httpStatus ?? "—"}，耗时 {connectTestResult.latencyMs}ms
              {connectTestResult.diagnosis?.suggestion ? ` · ${connectTestResult.diagnosis.suggestion}` : ""}
              <ErrorCorrectionPanel result={connectTestResult} onApply={applyConnectQuickFix} />
            </div>
          )}
        </div>
      )}

      {render && (
        <>
          <div className={card}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">输出</div>
              <button type="button" className={`${button} bg-slate-100 text-slate-800`} onClick={() => copyToClipboard("Base URL", render.resolvedBaseUrl)}>
                复制 Base URL
              </button>
            </div>
            <dl className="grid gap-2 text-sm md:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-700">Base URL（接口根地址）</dt>
                <dd className="break-all font-mono text-xs">{render.resolvedBaseUrl}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-700">鉴权（密钥写法）</dt>
                <dd>
                  {render.authType} · {render.authHeaderName || "—"} · <span className="font-mono text-xs">{render.authHeaderTemplate}</span>
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs text-slate-700">Model Name Rule（模型名规则）</dt>
                <dd>{render.modelNameRule}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-700">Resolved Model Name（当前解析模型名）</dt>
                <dd className="font-mono text-xs">{render.resolvedModelName || "（未指定）"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-700">Capability Hints（能力提示）</dt>
                <dd>{render.capabilityHints.join(" · ")}</dd>
              </div>
            </dl>
            {render.warnings.length > 0 ? (
              <div className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2">
                <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-900/85">warnings（注意事项）</div>
                <ul className="mt-1.5 list-inside list-disc text-xs leading-relaxed text-amber-950">
                {render.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              </div>
            ) : null}
            {render.knownPitfalls?.length ? (
              <div className="mt-3">
                <div className="text-xs font-semibold text-slate-600">常见坑（容易踩坑的地方）</div>
                <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
                  {render.knownPitfalls.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className={card}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">{render.softwareConfigSnippet.title}</div>
              <button type="button" className={`${button} bg-slate-100 text-slate-800`} onClick={() => copyToClipboard("配置片段", render.softwareConfigSnippet.body)}>
                复制配置片段
              </button>
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">{render.softwareConfigSnippet.body}</pre>
          </div>

          <div className={card}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">环境变量示例（密钥保存示例）</div>
              <button type="button" className={`${button} bg-slate-100 text-slate-800`} onClick={() => copyToClipboard("环境变量", render.envExample)}>
                复制
              </button>
            </div>
            <pre className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-xs font-mono">{render.envExample}</pre>
          </div>

          <div className={card}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">curl 示例（命令行测试示例）</div>
              <button type="button" className={`${button} bg-slate-100 text-slate-800`} onClick={() => copyToClipboard("curl", render.curlExample)}>
                复制 curl
              </button>
            </div>
            <pre className="mp-pre-terminal max-h-56 overflow-auto whitespace-pre-wrap rounded-lg p-3 text-xs font-mono">{render.curlExample}</pre>
          </div>

          {render.commonErrors.length > 0 ? (
            <div className={card}>
              <div className="text-sm font-semibold">常见错误 / 备注</div>
              <ul className="mt-2 space-y-2 text-sm">
                {render.commonErrors.map((row, idx) => (
                  <li key={`${idx}-${row.error.slice(0, 20)}`} className="rounded border border-slate-100 bg-slate-50/80 p-2">
                    <div className="font-medium">{row.error}</div>
                    {row.reason ? <div className="text-xs text-slate-600">原因：{row.reason}</div> : null}
                    {row.solution ? <div className="text-xs text-slate-700">处理：{row.solution}</div> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className={card}>
            <div className="text-sm font-semibold text-slate-900">连通测试（测试能不能连上）</div>
            <MpBillingNotice className="mt-2">
              <>
                <strong className="font-semibold">重要：</strong>
                测试将调用<strong>真实</strong>
                模型 API，可能消耗 token（用量额度）或<strong>产生费用</strong>
                （包括只拉取模型列表这类测试，也以服务商计费规则为准）。
              </>
            </MpBillingNotice>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <input
                  className={input}
                  type={showKey ? "text" : "password"}
                  placeholder={render.profileProtocol === "ollama" ? "API Key（密钥，本地 Ollama 可留空）" : "API Key（密钥）"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <button type="button" className={`mt-1 text-xs ${linkText}`} onClick={() => setShowKey(!showKey)}>
                  {showKey ? "隐藏" : "显示"}密钥
                </button>
              </div>
              <select className={input} value={testType} onChange={(e) => setTestType(e.target.value)}>
                {render.suggestedTestTypes.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className={`${button} mt-3 ${btnPrimary}`} onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
              {testMutation.isPending ? "测试中…" : "执行测试"}
            </button>
            {testMutation.error && !connectTestResult && (
              <div className="mt-2 text-sm text-red-700">
                <ApiErrorText err={testMutation.error as Error} />
              </div>
            )}
            {connectTestResult && (
              <div className={`mt-3 rounded-md p-3 text-sm ${connectTestResult.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                状态：{connectTestResult.success ? "成功" : "失败"} · HTTP {connectTestResult.httpStatus ?? "—"}
                ，耗时 {connectTestResult.latencyMs}ms
                {connectTestResult.diagnosis?.suggestion ? ` · ${connectTestResult.diagnosis.suggestion}` : ""}
                <ErrorCorrectionPanel result={connectTestResult} onApply={applyConnectQuickFix} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/connect" element={<ConnectPage />} />
        <Route path="/add-doc" element={<AddDocPage />} />
        <Route path="/providers" element={<ProvidersPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/doc-check" element={<DocCheckPage />} />
        <Route path="/providers/:id" element={<ProviderDetailPage />} />
        <Route path="/test-records" element={<TestRecordsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
