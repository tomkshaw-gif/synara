import { describe, expect, it } from "vitest";

import { groupFusionSidekickChoices, isSelectableFusionSidekick } from "./fusionSidekickChoices";

describe("groupFusionSidekickChoices", () => {
  it("drops Devin fusion pairings and duplicate slugs", () => {
    const groups = groupFusionSidekickChoices([
      { provider: "codex", providerLabel: "Codex", slug: "gpt-5.4", name: "GPT-5.4" },
      { provider: "codex", providerLabel: "Codex", slug: "gpt-5.4", name: "GPT-5.4 again" },
      { provider: "codex", providerLabel: "Codex", slug: "gpt-5.4-mini", name: "GPT-5.4 mini" },
      {
        provider: "devin",
        providerLabel: "Devin",
        slug: "fusion-claude-opus-5-5-high-sidekick-swe-2-medium",
        name: "Fusion pairing",
      },
      { provider: "devin", providerLabel: "Devin", slug: "fusion", name: "Fusion" },
      { provider: "devin", providerLabel: "Devin", slug: "swe-2-medium", name: "SWE-2 Medium" },
    ]);

    expect(groups.map((group) => group.provider)).toEqual(["codex", "devin"]);
    expect(groups[0]?.models.map((model) => model.slug)).toEqual(["gpt-5.4", "gpt-5.4-mini"]);
    expect(groups[1]?.models.map((model) => model.slug)).toEqual(["swe-2-medium"]);
  });

  it("rejects an empty slug", () => {
    expect(
      isSelectableFusionSidekick({
        provider: "codex",
        providerLabel: "Codex",
        slug: "  ",
        name: "Blank",
      }),
    ).toBe(false);
  });
});
