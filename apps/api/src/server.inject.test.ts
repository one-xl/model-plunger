import axios from "axios";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app, prisma } from "./server.js";

/** 满足 `analysisSchema` 的最小对象，供入库 inject 使用 */
const minimalAnalysis = {
  provider: { name: "Vitest Seed", officialWebsite: null, docsUrl: null, description: null },
  compatibility: { isOpenAICompatible: null, compatibleLevel: "unknown" as const, evidence: null, notes: null },
  auth: { type: "unknown" as const, headerName: null, headerValueTemplate: null, envNames: [] as string[], notes: null },
  endpoints: { baseUrl: null, chatCompletions: null, embeddings: null, models: null },
  models: [] as Array<Record<string, unknown>>,
  minimalRequests: {
    chat: { method: null, url: null, headers: {}, body: {} },
    modelsList: { method: null, url: null, headers: {} }
  },
  codeExamples: { curl: null, python: null, javascript: null },
  commonErrors: [] as Array<Record<string, unknown>>,
  limits: { rateLimit: null, quota: null, notes: null },
  analysisMeta: { confidence: 0, unknownFields: [] as string[], warnings: [] as string[], sourceUrls: [] as string[] }
};

describe("Fastify inject", () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("GET /api/health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  it("GET /api/settings returns shaped payload", async () => {
    const res = await app.inject({ method: "GET", url: "/api/settings" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: boolean; settings: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.settings).toMatchObject({
      analyzerBaseUrlConfigured: expect.any(Boolean),
      analyzerApiKeyConfigured: expect.any(Boolean),
      githubTokenConfigured: expect.any(Boolean)
    });
  });

  it("GET /api/integrations/targets lists static targets", async () => {
    const res = await app.inject({ method: "GET", url: "/api/integrations/targets" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: boolean; targets: Array<{ id: string }> };
    expect(body.ok).toBe(true);
    expect(body.targets.some((t) => t.id === "curl")).toBe(true);
  });

  it("GET /api/integrations/profiles lists static profiles", async () => {
    const res = await app.inject({ method: "GET", url: "/api/integrations/profiles" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: boolean; profiles: Array<{ id: string }> };
    expect(body.ok).toBe(true);
    expect(body.profiles.some((p) => p.id === "openai")).toBe(true);
  });

  it("POST /api/integrations/render returns curl and snippet", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/render",
      payload: { profileId: "openai", targetId: "curl" }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      ok: boolean;
      render: { curlExample: string; resolvedBaseUrl: string; suggestedTestTypes: Array<{ id: string }> };
    };
    expect(body.ok).toBe(true);
    expect(body.render.curlExample).toContain("chat/completions");
    expect(body.render.resolvedBaseUrl).toContain("api.openai.com");
    expect(body.render.suggestedTestTypes.map((t) => t.id)).toContain("chat-min");
  });

  it("POST /api/integrations/render rejects unknown profileId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/render",
      payload: { profileId: "nope", targetId: "curl" }
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/docs/fetch rejects invalid body", async () => {
    const res = await app.inject({ method: "POST", url: "/api/docs/fetch", payload: {} });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("POST /api/docs/fetch rejects multiple exclusive modes", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/docs/fetch",
      payload: {
        url: "https://example.com/",
        recursiveSameOrigin: true,
        fromSitemap: true
      }
    });
    expect(res.statusCode).toBe(400);
    expect((JSON.parse(res.body) as { ok: boolean }).ok).toBe(false);
  });

  it("POST /api/docs/fetch returns doc for single-page mode when axios is mocked", async () => {
    const pageUrl = "https://example.com/vitest-fetch-single-success";
    const spy = vi.spyOn(axios, "get").mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/robots.txt")) {
        return {
          data: Buffer.from("User-agent: *\nDisallow:\n", "utf8"),
          headers: {},
          status: 200,
          statusText: "OK",
          config: {}
        } as AxiosResponse;
      }
      if (u.includes("vitest-fetch-single-success")) {
        return {
          data: '<!DOCTYPE html><html><head><title>Fetch Single Title</title></head><body><article><p>Paragraph fetch-single-marker-fs-99</p></article></body></html>',
          headers: {},
          status: 200,
          statusText: "OK",
          config: {}
        } as AxiosResponse;
      }
      throw new Error(`unexpected axios.get in fetch single-page test: ${u}`);
    });

    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/docs/fetch",
        payload: { url: pageUrl }
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        ok: boolean;
        doc: { url: string; title: string; markdown: string; textLength: number };
      };
      expect(body.ok).toBe(true);
      expect(body.doc.url).toContain("vitest-fetch-single-success");
      expect(body.doc.title.length).toBeGreaterThan(0);
      expect(body.doc.markdown).toContain("fetch-single-marker-fs-99");
      expect(body.doc.textLength).toBe(body.doc.markdown.length);
    } finally {
      spy.mockRestore();
    }
  });

  it("POST /api/docs/fetch accepts blank optional providerName", async () => {
    const pageUrl = "https://example.com/vitest-fetch-blank-provider-name";
    const spy = vi.spyOn(axios, "get").mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/robots.txt")) {
        return {
          data: Buffer.from("User-agent: *\nDisallow:\n", "utf8"),
          headers: {},
          status: 200,
          statusText: "OK",
          config: {}
        } as AxiosResponse;
      }
      if (u.includes("vitest-fetch-blank-provider-name")) {
        return {
          data: '<!DOCTYPE html><html><head><title>Blank Provider Name</title></head><body><article><p>blank-provider-name-marker</p></article></body></html>',
          headers: {},
          status: 200,
          statusText: "OK",
          config: {}
        } as AxiosResponse;
      }
      throw new Error(`unexpected axios.get in blank providerName test: ${u}`);
    });

    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/docs/fetch",
        payload: { url: pageUrl, providerName: "" }
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { ok: boolean; doc: { markdown: string } };
      expect(body.ok).toBe(true);
      expect(body.doc.markdown).toContain("blank-provider-name-marker");
    } finally {
      spy.mockRestore();
    }
  });

  it("POST /api/docs/sitemap rejects invalid body", async () => {
    const res = await app.inject({ method: "POST", url: "/api/docs/sitemap", payload: {} });
    expect(res.statusCode).toBe(400);
    expect((JSON.parse(res.body) as { ok: boolean }).ok).toBe(false);
  });

  it("POST /api/docs/analyze rejects markdown shorter than schema minimum", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/docs/analyze",
      payload: {
        url: "https://example.com/doc",
        markdown: "x".repeat(49)
      }
    });
    expect(res.statusCode).toBe(400);
    expect((JSON.parse(res.body) as { ok: boolean }).ok).toBe(false);
  });

  it("POST /api/docs/analyze succeeds when ANALYZER_* is set and axios.post returns valid JSON", async () => {
    const saved = {
      ANALYZER_BASE_URL: process.env.ANALYZER_BASE_URL,
      ANALYZER_API_KEY: process.env.ANALYZER_API_KEY,
      ANALYZER_MODEL: process.env.ANALYZER_MODEL
    };
    process.env.ANALYZER_BASE_URL = "https://api.analyze-mock.example/v1";
    process.env.ANALYZER_API_KEY = "sk-test-analyze-mock-only";
    process.env.ANALYZER_MODEL = "gpt-mock-mini";

    const spy = vi.spyOn(axios, "post").mockImplementation(async (url: string) => {
      expect(String(url)).toContain("/chat/completions");
      return { data: { choices: [{ message: { content: JSON.stringify(minimalAnalysis) } }] } };
    });

    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/docs/analyze",
        payload: {
          url: "https://example.com/analyze-success-doc",
          providerName: "mock",
          markdown: "body ".repeat(20).trimEnd()
        }
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        ok: boolean;
        analysis: { provider: { name: string | null } };
        repairSteps: string[];
      };
      expect(body.ok).toBe(true);
      expect(body.analysis.provider.name).toBe("Vitest Seed");
      expect(body.repairSteps).toContain("zod_validated");
    } finally {
      spy.mockRestore();
      for (const [k, v] of Object.entries(saved) as [keyof typeof saved, string | undefined][]) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("POST /api/providers rejects invalid save payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/providers",
      payload: {}
    });
    expect(res.statusCode).toBe(400);
    expect((JSON.parse(res.body) as { ok: boolean }).ok).toBe(false);
  });

  it("POST /api/check/test rejects chat without api key (Zod) and does not write TestRecord", async () => {
    const before = await prisma.testRecord.count();
    const res = await app.inject({
      method: "POST",
      url: "/api/check/test",
      payload: { baseUrl: "https://api.openai.com/v1", testType: "chat", apiKey: "" }
    });
    expect(res.statusCode).toBe(400);
    expect((JSON.parse(res.body) as { ok: boolean }).ok).toBe(false);
    expect(await prisma.testRecord.count()).toBe(before);
  });

  it("POST /api/check/test chat-min persists usageSnapshot when axios returns usage (mock)", async () => {
    const spy = vi.spyOn(axios, "request").mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      data: {
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }
      },
      headers: {},
      config: {} as AxiosRequestConfig
    } as AxiosResponse);

    try {
      const before = await prisma.testRecord.count();
      const res = await app.inject({
        method: "POST",
        url: "/api/check/test",
        payload: {
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test-mock-only",
          model: "gpt-4o-mini",
          testType: "chat-min",
          providerProtocol: "openai-compatible",
          maxTokens: 8,
          timeoutMs: 30000
        }
      });
      expect(res.statusCode).toBe(200);
      expect(await prisma.testRecord.count()).toBe(before + 1);
      const listRes = await app.inject({ method: "GET", url: "/api/test-records" });
      const body = JSON.parse(listRes.body) as { records: Array<{ usageSnapshot?: string | null }> };
      expect(body.records[0]?.usageSnapshot ?? "").toContain("total_tokens");
    } finally {
      spy.mockRestore();
    }
  });

  it("POST /api/check/test returns beginner diagnosis and quick fixes for 404 URL mistakes", async () => {
    const spy = vi.spyOn(axios, "request").mockResolvedValueOnce({
      status: 404,
      statusText: "Not Found",
      data: { error: { message: "not found" } },
      headers: {},
      config: {} as AxiosRequestConfig
    } as AxiosResponse);
    const postSpy = vi.spyOn(axios, "post").mockRejectedValueOnce(new Error("fallback disabled in test"));

    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/check/test",
        payload: {
          baseUrl: "https://api.example.com/v1/chat/completions",
          apiKey: "sk-test-mock-only",
          model: "demo-model",
          testType: "chat-min",
          maxTokens: 1,
          timeoutMs: 30000
        }
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body) as {
        result: { diagnosis: { type: string; reason: string; suggestion: string; quickFixes: Array<{ patch: { baseUrl?: string } }> } };
      };
      expect(body.result.diagnosis.type).toBe("ENDPOINT_ERROR");
      expect(body.result.diagnosis.reason).toContain("URL");
      expect(body.result.diagnosis.quickFixes.some((f) => f.patch.baseUrl === "https://api.example.com/v1")).toBe(true);
    } finally {
      spy.mockRestore();
      postSpy.mockRestore();
    }
  });

  it("GET /api/providers returns ok list", async () => {
    const res = await app.inject({ method: "GET", url: "/api/providers" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: boolean; providers: unknown[] };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.providers)).toBe(true);
  });

  it("GET /api/stats returns shaped counters", async () => {
    const res = await app.inject({ method: "GET", url: "/api/stats" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      ok: boolean;
      stats: { providerCount: number; analyzedDocCount: number; testCount: number };
    };
    expect(body.ok).toBe(true);
    expect(typeof body.stats.providerCount).toBe("number");
    expect(typeof body.stats.analyzedDocCount).toBe("number");
    expect(typeof body.stats.testCount).toBe("number");
  });

  it("POST /api/docs/check-updates accepts empty filter", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/docs/check-updates",
      payload: {}
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: boolean; summary: { total: number } };
    expect(body.ok).toBe(true);
    expect(typeof body.summary.total).toBe("number");
  });

  it("POST /api/docs/check-updates marks changed when live HTML mocks differ (scoped providerIds)", async () => {
    const docUrl = "https://example.com/vitest-check-updates-success";
    const spy = vi.spyOn(axios, "get").mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/robots.txt")) {
        return {
          data: Buffer.from("User-agent: *\nDisallow:\n", "utf8"),
          headers: {},
          status: 200,
          statusText: "OK",
          config: {}
        } as AxiosResponse;
      }
      if (u.includes("vitest-check-updates-success")) {
        return {
          data: '<!DOCTYPE html><html><head><title>x</title></head><body><article><p>Live body marker cu-live-zz</p></article></body></html>',
          headers: {},
          status: 200,
          statusText: "OK",
          config: {}
        } as AxiosResponse;
      }
      throw new Error(`unexpected axios.get in check-updates test: ${u}`);
    });

    const before = await prisma.provider.count();
    try {
      const analysis = {
        ...minimalAnalysis,
        provider: { ...minimalAnalysis.provider, name: "Vitest Check Updates OK" }
      };
      const saveRes = await app.inject({
        method: "POST",
        url: "/api/providers",
        payload: {
          analysis,
          sourceMarkdown: "# Stored title\n\nStored body marker cu-store-xx.\n",
          sourceUrl: docUrl,
          sourceTitle: "Check Updates Doc"
        }
      });
      expect(saveRes.statusCode).toBe(200);
      const { providerId } = JSON.parse(saveRes.body) as { providerId: string };

      const checkRes = await app.inject({
        method: "POST",
        url: "/api/docs/check-updates",
        payload: { providerIds: [providerId] }
      });
      expect(checkRes.statusCode).toBe(200);
      const body = JSON.parse(checkRes.body) as {
        ok: boolean;
        summary: { total: number; changed: number; unchanged: number; errors: number };
        results: Array<{ changed: boolean | null; liveHash: string | null; error?: string }>;
      };
      expect(body.ok).toBe(true);
      expect(body.summary.total).toBe(1);
      expect(body.summary.errors).toBe(0);
      expect(body.summary.changed).toBe(1);
      expect(body.summary.unchanged).toBe(0);
      expect(body.results.length).toBe(1);
      expect(body.results[0].changed).toBe(true);
      expect(body.results[0].liveHash).toBeTruthy();

      await app.inject({ method: "DELETE", url: `/api/providers/${providerId}` });
      expect(await prisma.provider.count()).toBe(before);
    } finally {
      spy.mockRestore();
    }
  });

  it("POST /api/docs/diff-versions returns 404 for unknown docId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/docs/diff-versions",
      payload: { docId: "nonexistent-doc-id" }
    });
    expect(res.statusCode).toBe(404);
    expect((JSON.parse(res.body) as { ok: boolean }).ok).toBe(false);
  });

  it("POST /api/docs/diff-versions returns 200 with unifiedDiff when fetch is mocked", async () => {
    const docUrl = "https://example.com/vitest-diff-versions-success";
    const spy = vi.spyOn(axios, "get").mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/robots.txt")) {
        return {
          data: Buffer.from("User-agent: *\nDisallow:\n", "utf8"),
          headers: {},
          status: 200,
          statusText: "OK",
          config: {}
        } as AxiosResponse;
      }
      if (u.includes("vitest-diff-versions-success")) {
        return {
          data: '<!DOCTYPE html><html><head><title>x</title></head><body><article><p>Live body marker dd-live-zz</p></article></body></html>',
          headers: {},
          status: 200,
          statusText: "OK",
          config: {}
        } as AxiosResponse;
      }
      throw new Error(`unexpected axios.get in diff-versions test: ${u}`);
    });

    const before = await prisma.provider.count();
    try {
      const analysis = {
        ...minimalAnalysis,
        provider: { ...minimalAnalysis.provider, name: "Vitest Diff Versions OK" }
      };
      const saveRes = await app.inject({
        method: "POST",
        url: "/api/providers",
        payload: {
          analysis,
          sourceMarkdown: "# Stored title\n\nStored body marker dd-store-xx.\n",
          sourceUrl: docUrl,
          sourceTitle: "Diff Versions Doc"
        }
      });
      expect(saveRes.statusCode).toBe(200);
      const { providerId } = JSON.parse(saveRes.body) as { providerId: string };

      const docRow = await prisma.providerDoc.findFirst({ where: { providerId } });
      expect(docRow).toBeTruthy();

      const diffRes = await app.inject({
        method: "POST",
        url: "/api/docs/diff-versions",
        payload: { docId: docRow!.id }
      });
      expect(diffRes.statusCode).toBe(200);
      const body = JSON.parse(diffRes.body) as {
        ok: boolean;
        identical: boolean;
        storedHash: string;
        liveHash: string;
        unifiedDiff: string;
        markdownTruncated: boolean;
      };
      expect(body.ok).toBe(true);
      expect(body.identical).toBe(false);
      expect(body.storedHash).not.toBe(body.liveHash);
      expect(body.unifiedDiff.length).toBeGreaterThan(20);
      expect(body.markdownTruncated).toBe(false);

      await app.inject({ method: "DELETE", url: `/api/providers/${providerId}` });
      expect(await prisma.provider.count()).toBe(before);
    } finally {
      spy.mockRestore();
    }
  });

  it("GET /api/knowledge/export returns snapshot shape", async () => {
    const res = await app.inject({ method: "GET", url: "/api/knowledge/export" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      ok: boolean;
      formatVersion: number;
      providers: unknown[];
      providerCount: number;
    };
    expect(body.ok).toBe(true);
    expect(body.formatVersion).toBe(1);
    expect(Array.isArray(body.providers)).toBe(true);
    expect(body.providerCount).toBe(body.providers.length);
  });

  it("POST /api/knowledge/import rejects invalid body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/knowledge/import",
      payload: {}
    });
    expect(res.statusCode).toBe(400);
    expect((JSON.parse(res.body) as { ok: boolean }).ok).toBe(false);
  });

  it("POST /api/knowledge/import accepts empty providers (merge)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/knowledge/import",
      payload: { formatVersion: 1, providers: [], mode: "merge" }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: boolean; imported: number };
    expect(body.ok).toBe(true);
    expect(body.imported).toBe(0);
  });

  it("GET /api/test-records returns ok list", async () => {
    const res = await app.inject({ method: "GET", url: "/api/test-records" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: boolean; records: unknown[] };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.records)).toBe(true);
  });

  it("POST /api/providers creates row, GET returns it, DELETE removes", async () => {
    const before = await prisma.provider.count();
    const saveRes = await app.inject({
      method: "POST",
      url: "/api/providers",
      payload: {
        analysis: minimalAnalysis,
        sourceMarkdown: "# Vitest provider seed\n\nBody for hash.",
        sourceUrl: "https://example.com/vitest-provider-doc",
        sourceTitle: "Vitest Doc"
      }
    });
    expect(saveRes.statusCode).toBe(200);
    const saved = JSON.parse(saveRes.body) as { ok: boolean; providerId: string };
    expect(saved.ok).toBe(true);
    expect(typeof saved.providerId).toBe("string");

    const getRes = await app.inject({ method: "GET", url: `/api/providers/${saved.providerId}` });
    expect(getRes.statusCode).toBe(200);
    const got = JSON.parse(getRes.body) as { ok: boolean; provider: { id: string; name: string } };
    expect(got.ok).toBe(true);
    expect(got.provider.id).toBe(saved.providerId);
    expect(got.provider.name).toBe("Vitest Seed");

    const delRes = await app.inject({ method: "DELETE", url: `/api/providers/${saved.providerId}` });
    expect(delRes.statusCode).toBe(200);
    expect(await prisma.provider.count()).toBe(before);
  });

  it("POST /api/knowledge/import merge restores snapshot from GET /api/knowledge/export", async () => {
    const before = await prisma.provider.count();
    const saveRes = await app.inject({
      method: "POST",
      url: "/api/providers",
      payload: {
        analysis: minimalAnalysis,
        sourceMarkdown: "# Merge round-trip\n\nBody.",
        sourceUrl: "https://example.com/knowledge-merge-roundtrip",
        sourceTitle: "Merge RT"
      }
    });
    expect(saveRes.statusCode).toBe(200);
    const { providerId } = JSON.parse(saveRes.body) as { providerId: string };

    const exportRes = await app.inject({ method: "GET", url: "/api/knowledge/export" });
    expect(exportRes.statusCode).toBe(200);
    const exportBody = JSON.parse(exportRes.body) as { providers: Array<Record<string, unknown>> };
    const entry = exportBody.providers.find((p) => String((p as { name?: unknown }).name) === "Vitest Seed");
    expect(entry).toBeTruthy();

    await app.inject({ method: "DELETE", url: `/api/providers/${providerId}` });
    expect(await prisma.provider.count()).toBe(before);

    const impRes = await app.inject({
      method: "POST",
      url: "/api/knowledge/import",
      payload: { formatVersion: 1, providers: [entry], mode: "merge" }
    });
    expect(impRes.statusCode).toBe(200);
    const imp = JSON.parse(impRes.body) as { ok: boolean; imported: number };
    expect(imp.ok).toBe(true);
    expect(imp.imported).toBe(1);

    const listRes = await app.inject({ method: "GET", url: "/api/providers" });
    const list = JSON.parse(listRes.body) as { providers: Array<{ id: string; name: string }> };
    const restored = list.providers.find((p) => p.name === "Vitest Seed");
    expect(restored).toBeTruthy();

    await app.inject({ method: "DELETE", url: `/api/providers/${restored!.id}` });
    expect(await prisma.provider.count()).toBe(before);
  });

  it("POST /api/knowledge/import replace wipes providers then loads snapshot", async () => {
    const before = await prisma.provider.count();
    const junkAnalysis = { ...minimalAnalysis, provider: { ...minimalAnalysis.provider, name: "Vitest Replace Junk" } };
    const keepAnalysis = { ...minimalAnalysis, provider: { ...minimalAnalysis.provider, name: "Vitest Replace Keep" } };

    const junkRes = await app.inject({
      method: "POST",
      url: "/api/providers",
      payload: {
        analysis: junkAnalysis,
        sourceMarkdown: "# Junk row\n\nBody.",
        sourceUrl: "https://example.com/replace-junk",
        sourceTitle: "Junk"
      }
    });
    expect(junkRes.statusCode).toBe(200);

    const keepRes = await app.inject({
      method: "POST",
      url: "/api/providers",
      payload: {
        analysis: keepAnalysis,
        sourceMarkdown: "# Keep row\n\nBody.",
        sourceUrl: "https://example.com/replace-keep",
        sourceTitle: "Keep"
      }
    });
    expect(keepRes.statusCode).toBe(200);
    expect(await prisma.provider.count()).toBe(before + 2);

    const exportRes = await app.inject({ method: "GET", url: "/api/knowledge/export" });
    expect(exportRes.statusCode).toBe(200);
    const exportBody = JSON.parse(exportRes.body) as { providers: Array<Record<string, unknown>> };
    const entry = exportBody.providers.find((p) => String((p as { name?: unknown }).name) === "Vitest Replace Keep");
    expect(entry).toBeTruthy();

    const impRes = await app.inject({
      method: "POST",
      url: "/api/knowledge/import",
      payload: { formatVersion: 1, providers: [entry], mode: "replace" }
    });
    expect(impRes.statusCode).toBe(200);
    const imp = JSON.parse(impRes.body) as { ok: boolean; imported: number; mode: string };
    expect(imp.ok).toBe(true);
    expect(imp.imported).toBe(1);
    expect(imp.mode).toBe("replace");

    expect(await prisma.provider.count()).toBe(1);
    const listRes = await app.inject({ method: "GET", url: "/api/providers" });
    const list = JSON.parse(listRes.body) as { providers: Array<{ id: string; name: string }> };
    expect(list.providers.length).toBe(1);
    expect(list.providers[0].name).toBe("Vitest Replace Keep");

    await app.inject({ method: "DELETE", url: `/api/providers/${list.providers[0].id}` });
    expect(await prisma.provider.count()).toBe(before);
  });
});
