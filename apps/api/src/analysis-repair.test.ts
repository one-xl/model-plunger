import { describe, expect, it } from "vitest";
import {
  extractFirstJsonObject,
  normalizeAnalysisStructure,
  repairParseAiJsonContent,
  stripMarkdownFenceLoose,
  stripTrailingCommas,
  unwrapAnalysisEnvelope
} from "./analysis-repair.js";

describe("stripMarkdownFenceLoose", () => {
  it("unwraps ```json fenced block", () => {
    const raw = "```json\n{\"a\":1}\n```";
    expect(stripMarkdownFenceLoose(raw)).toBe('{"a":1}');
  });
});

describe("extractFirstJsonObject", () => {
  it("extracts balanced object from prefix/suffix noise", () => {
    const s = 'prefix {"x":"y","z":{}} trailing';
    expect(extractFirstJsonObject(s)).toBe('{"x":"y","z":{}}');
  });
});

describe("stripTrailingCommas", () => {
  it("removes trailing commas before } or ]", () => {
    expect(stripTrailingCommas('{"a":1,}')).toBe('{"a":1}');
    expect(stripTrailingCommas('[1,2,]')).toBe('[1,2]');
  });
});

describe("unwrapAnalysisEnvelope", () => {
  const minimal = {
    provider: { name: null, officialWebsite: null, docsUrl: null, description: null },
    compatibility: { isOpenAICompatible: null, compatibleLevel: "unknown", evidence: null, notes: null },
    auth: { type: "unknown", headerName: null, headerValueTemplate: null, envNames: [], notes: null },
    endpoints: { baseUrl: null, chatCompletions: null, embeddings: null, models: null },
    models: [],
    minimalRequests: {
      chat: { method: null, url: null, headers: {}, body: {} },
      modelsList: { method: null, url: null, headers: {} }
    },
    codeExamples: { curl: null, python: null, javascript: null },
    commonErrors: [],
    limits: { rateLimit: null, quota: null, notes: null },
    analysisMeta: { confidence: 0, unknownFields: [], warnings: [], sourceUrls: [] }
  };

  it("returns inner object when wrapped under analysis", () => {
    const wrapped = { analysis: minimal };
    expect(unwrapAnalysisEnvelope(wrapped)).toBe(minimal);
  });

  it("returns same object when provider at top level", () => {
    expect(unwrapAnalysisEnvelope(minimal as Record<string, unknown>)).toBe(minimal);
  });
});

describe("normalizeAnalysisStructure", () => {
  it("coerces invalid enums to unknown defaults", () => {
    const out = normalizeAnalysisStructure({
      provider: {},
      compatibility: { compatibleLevel: "not-a-level", isOpenAICompatible: "yes" },
      auth: { type: "weird", envNames: [1, "OK"] },
      endpoints: {},
      models: [{ type: "bogus", name: "n" }],
      minimalRequests: {
        chat: { headers: [], body: "bad" },
        modelsList: { headers: null }
      },
      codeExamples: {},
      commonErrors: [{}],
      limits: {},
      analysisMeta: { unknownFields: [1, "u"], confidence: 999 }
    });
    expect(out.compatibility.compatibleLevel).toBe("unknown");
    expect(out.compatibility.isOpenAICompatible).toBe(true);
    expect(out.auth.type).toBe("unknown");
    expect(out.auth.envNames).toEqual(["OK"]);
    expect(out.models[0].type).toBe("unknown");
    expect(out.minimalRequests.chat.headers).toEqual({});
    expect(out.minimalRequests.chat.body).toEqual({});
    expect(out.analysisMeta.confidence).toBe(100);
    expect(out.analysisMeta.unknownFields).toEqual(["u"]);
  });
});

describe("repairParseAiJsonContent", () => {
  it("parses fenced JSON with trailing comma repair", () => {
    const inner = {
      provider: { name: "P", officialWebsite: null, docsUrl: null, description: null },
      compatibility: { isOpenAICompatible: null, compatibleLevel: "unknown", evidence: null, notes: null },
      auth: { type: "unknown", headerName: null, headerValueTemplate: null, envNames: [], notes: null },
      endpoints: { baseUrl: null, chatCompletions: null, embeddings: null, models: null },
      models: [],
      minimalRequests: {
        chat: { method: null, url: null, headers: {}, body: {} },
        modelsList: { method: null, url: null, headers: {} }
      },
      codeExamples: { curl: null, python: null, javascript: null },
      commonErrors: [],
      limits: { rateLimit: null, quota: null, notes: null },
      analysisMeta: { confidence: 0, unknownFields: [], warnings: [], sourceUrls: [] }
    };
    const raw = "```json\n" + JSON.stringify(inner).replace(/\}$/, ",}") + "\n```";
    const r = repairParseAiJsonContent(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { provider: { name: string | null } }).provider.name).toBe("P");
  });

  it("fails on non-JSON prose", () => {
    const r = repairParseAiJsonContent("这里没有 JSON，只是一段说明文字。");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });
});
