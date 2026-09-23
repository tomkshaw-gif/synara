import { describe, expect, it } from "vitest";

import {
  FUSION_SIDEKICK_ROLE,
  buildFusionLeadPrompt,
  buildFusionSlashCommand,
  isFusionSidekickRole,
  parseFusionInvocation,
} from "./fusionInvocation";

describe("parseFusionInvocation", () => {
  it("reads a sidekick target and the task", () => {
    expect(
      parseFusionInvocation("/fusion sidekick:codex/gpt-5.4-mini fix the failing test"),
    ).toEqual({
      sidekick: { provider: "codex", model: "gpt-5.4-mini" },
      prompt: "fix the failing test",
    });
  });

  it("keeps slashes that belong to the model slug", () => {
    expect(
      parseFusionInvocation("/fusion sidekick:opencode/openrouter/gpt-oss-120b explain the parser"),
    ).toEqual({
      sidekick: { provider: "opencode", model: "openrouter/gpt-oss-120b" },
      prompt: "explain the parser",
    });
  });

  it("accepts provider casing and a camelCase provider", () => {
    expect(
      parseFusionInvocation("/Fusion sidekick:ClaudeAgent/claude-sonnet-5 tidy the types"),
    ).toEqual({
      sidekick: { provider: "claudeAgent", model: "claude-sonnet-5" },
      prompt: "tidy the types",
    });
  });

  it("treats a missing or unknown sidekick as an incomplete command", () => {
    expect(parseFusionInvocation("/fusion fix the test")).toEqual({
      sidekick: null,
      prompt: "fix the test",
    });
    expect(parseFusionInvocation("/fusion sidekick:nope/gpt-5.4-mini fix the test")).toEqual({
      sidekick: null,
      prompt: "sidekick:nope/gpt-5.4-mini fix the test",
    });
    expect(parseFusionInvocation("/fusion")).toEqual({ sidekick: null, prompt: "" });
  });

  it("ignores the token unless it starts the message", () => {
    expect(parseFusionInvocation("please /fusion sidekick:codex/gpt-5.4-mini later")).toBeNull();
    expect(parseFusionInvocation("    /fusion sidekick:codex/gpt-5.4-mini later")).toBeNull();
  });

  it("round-trips the command the picker inserts", () => {
    const command = buildFusionSlashCommand(
      { provider: "grok", model: "grok-4.6" },
      "rename the helper",
    );
    expect(command).toBe("/fusion sidekick:grok/grok-4.6 rename the helper");
    expect(parseFusionInvocation(command)).toEqual({
      sidekick: { provider: "grok", model: "grok-4.6" },
      prompt: "rename the helper",
    });
    expect(buildFusionSlashCommand({ provider: "codex", model: "gpt-5.4-mini" }, "  ")).toBe(
      "/fusion sidekick:codex/gpt-5.4-mini ",
    );
  });
});

describe("buildFusionLeadPrompt", () => {
  it("names the exact sidekick target and the hidden spawn mode", () => {
    const prompt = buildFusionLeadPrompt({
      sidekick: { provider: "codex", model: "gpt-5.4-mini" },
      prompt: "fix the failing test",
    });
    expect(prompt).toContain("Fusion mode");
    expect(prompt).toContain('spawnAs:"sidekick"');
    expect(prompt).toContain('{"provider":"codex","model":"gpt-5.4-mini"}');
    expect(prompt).toContain("fix the failing test");
    expect(prompt).not.toContain("/fusion");
  });

  it("refuses to invent a model when the sidekick is missing", () => {
    const prompt = buildFusionLeadPrompt({ sidekick: null, prompt: "fix the failing test" });
    expect(prompt).toContain("without a sidekick model");
    expect(prompt).toContain("Do not create threads");
    expect(prompt).not.toContain('spawnAs:"sidekick"');
  });
});

describe("isFusionSidekickRole", () => {
  it("matches only the reserved role", () => {
    expect(isFusionSidekickRole(FUSION_SIDEKICK_ROLE)).toBe(true);
    expect(isFusionSidekickRole("implementer")).toBe(false);
    expect(isFusionSidekickRole(null)).toBe(false);
  });
});
