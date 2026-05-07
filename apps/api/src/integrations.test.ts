import { describe, expect, it } from "vitest";
import { getOpenAiCompatibleChatPayload } from "./integrations.js";

describe("getOpenAiCompatibleChatPayload", () => {
  it("uses minimal prompts and clamps max_tokens for chat-min", () => {
    const p = getOpenAiCompatibleChatPayload("chat-min", "m1", 1);
    expect(p.messages[0].content).toContain("ok");
    expect(p.max_tokens).toBeGreaterThanOrEqual(4);
    expect(p.max_tokens).toBeLessThanOrEqual(8);
  });

  it("respects higher requested max within json-min cap", () => {
    const p = getOpenAiCompatibleChatPayload("json-min", "m2", 24);
    expect(p.max_tokens).toBe(24);
    expect(p.messages[0].content).toContain('"ok"');
  });
});
