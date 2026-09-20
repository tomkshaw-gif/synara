import { describe, expect, it } from "vitest";
import type { ProviderModelVariantDescriptor } from "@synara/contracts";

import {
  buildDevinFusionCatalog,
  devinFusionChoiceFromUid,
  devinFusionEffortsFor,
  devinFusionFastModePatch,
  devinFusionLeads,
  devinFusionNormalizePatch,
  devinFusionSidekicksFor,
  devinFusionSupportsFast,
  devinFusionUidForChoice,
  formatDevinFusionPairLabel,
  resolveDevinFusionChoice,
} from "./devinFusion";

const VARIANTS: ReadonlyArray<ProviderModelVariantDescriptor> = [
  { model: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium" },
  { model: "fusion-claude-fable-5-1-medium-fast-sidekick-swe-2-medium" },
  { model: "fusion-claude-fable-5-1-high-sidekick-swe-2-medium" },
  { model: "fusion-claude-fable-5-1-high-sidekick-glm-5-2" },
  { model: "fusion-claude-opus-5-medium-sidekick-swe-2-medium" },
  { model: "fusion-claude-opus-5-high-sidekick-swe-2-medium-priority" },
  { model: "fusion-claude-opus-5-high-sidekick-gpt-5-6-luna" },
  { model: "gpt-5-6-sol-high" },
];

describe("buildDevinFusionCatalog", () => {
  it("indexes only the fusion uids from a variant list", () => {
    const catalog = buildDevinFusionCatalog(VARIANTS);

    expect(catalog?.uids.size).toBe(7);
    expect(catalog?.uids.has("gpt-5-6-sol-high")).toBe(false);
    expect(catalog?.uids.has("fusion-claude-fable-5-1-medium-sidekick-swe-2-medium")).toBe(true);
  });

  it("returns null when no fusion variants exist", () => {
    expect(buildDevinFusionCatalog([{ model: "gpt-5-6-sol-high" }])).toBeNull();
    expect(buildDevinFusionCatalog([])).toBeNull();
    expect(buildDevinFusionCatalog(undefined)).toBeNull();
  });
});

describe("Devin Fusion catalog axes", () => {
  const catalog = buildDevinFusionCatalog(VARIANTS);

  it("lists leads in catalog order", () => {
    expect(devinFusionLeads(catalog!)).toEqual(["claude-fable-5-1", "claude-opus-5"]);
  });

  it("lists a lead's efforts in effort order", () => {
    expect(devinFusionEffortsFor(catalog!, "claude-fable-5-1")).toEqual(["medium", "high"]);
  });

  it("detects a lead's fast tier per effort", () => {
    expect(devinFusionSupportsFast(catalog!, "claude-fable-5-1", "medium")).toBe(true);
    expect(devinFusionSupportsFast(catalog!, "claude-fable-5-1", "high")).toBe(false);
    expect(devinFusionSupportsFast(catalog!, "claude-opus-5", "high")).toBe(false);
  });

  it("lists the sidekicks a pairing actually offers", () => {
    expect(devinFusionSidekicksFor(catalog!, "claude-fable-5-1", "high", false)).toEqual([
      "swe-2-medium",
      "glm-5-2",
    ]);
    expect(devinFusionSidekicksFor(catalog!, "claude-opus-5", "high", false)).toEqual([
      "swe-2-medium-priority",
      "gpt-5-6-luna",
    ]);
  });
});

describe("resolveDevinFusionChoice", () => {
  const catalog = buildDevinFusionCatalog(VARIANTS)!;

  it("preserves a fully valid choice", () => {
    expect(
      resolveDevinFusionChoice(catalog, {
        lead: "claude-fable-5-1",
        effort: "medium",
        fast: true,
        sidekick: "swe-2-medium",
      }),
    ).toEqual({
      lead: "claude-fable-5-1",
      effort: "medium",
      fast: true,
      sidekick: "swe-2-medium",
    });
  });

  it("clamps a stale effort to medium and keeps the lead's pairing", () => {
    expect(
      resolveDevinFusionChoice(catalog, {
        lead: "claude-opus-5",
        effort: "xhigh",
        sidekick: "gpt-5-6-luna",
      }),
    ).toEqual({
      lead: "claude-opus-5",
      effort: "medium",
      fast: false,
      sidekick: "swe-2-medium",
    });
  });

  it("drops fast when the pairing has no fast tier", () => {
    const choice = resolveDevinFusionChoice(catalog, {
      lead: "claude-opus-5",
      effort: "high",
      fast: true,
      sidekick: "gpt-5-6-luna",
    });
    expect(choice?.fast).toBe(false);
    expect(choice?.sidekick).toBe("gpt-5-6-luna");
  });

  it("falls back to the first lead when the choice is empty", () => {
    expect(resolveDevinFusionChoice(catalog, {})).toEqual({
      lead: "claude-fable-5-1",
      effort: "medium",
      fast: false,
      sidekick: "swe-2-medium",
    });
  });
});

describe("Devin Fusion choice/uid conversion", () => {
  it("round-trips a choice through the uid", () => {
    const uid = "fusion-claude-opus-5-high-fast-sidekick-swe-2-medium-priority";
    const catalog = buildDevinFusionCatalog([{ model: uid }])!;
    const choice = resolveDevinFusionChoice(catalog, devinFusionChoiceFromUid(uid));

    expect(devinFusionUidForChoice(choice!)).toBe(uid);
  });

  it("returns an empty choice for a non-fusion uid", () => {
    expect(devinFusionChoiceFromUid("gpt-5-6-sol-high")).toEqual({});
    expect(devinFusionChoiceFromUid(undefined)).toEqual({});
  });
});

describe("devinFusionFastModePatch", () => {
  it("rewrites the pairing uid's fast marker", () => {
    expect(
      devinFusionFastModePatch({
        modelVariants: VARIANTS,
        modelVariant: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
        fast: true,
      }),
    ).toEqual({
      modelVariant: "fusion-claude-fable-5-1-medium-fast-sidekick-swe-2-medium",
    });
  });

  it("returns null when the pairing has no fast tier", () => {
    expect(
      devinFusionFastModePatch({
        modelVariants: VARIANTS,
        modelVariant: "fusion-claude-opus-5-high-sidekick-gpt-5-6-luna",
        fast: true,
      }),
    ).toBeNull();
  });

  it("returns null for non-fusion variant lists", () => {
    expect(
      devinFusionFastModePatch({
        modelVariants: [{ model: "gpt-5-6-sol-high" }],
        modelVariant: undefined,
        fast: true,
      }),
    ).toBeNull();
  });
});

describe("devinFusionNormalizePatch", () => {
  const catalog = buildDevinFusionCatalog(VARIANTS)!;

  it("strips a stale pairing when the target family is not Fusion", () => {
    expect(
      devinFusionNormalizePatch({
        catalog: null,
        patch: { reasoningEffort: "high", modelVariant: "fusion-x" },
        currentVariant: undefined,
      }),
    ).toEqual({ reasoningEffort: "high", modelVariant: undefined });
  });

  it("keeps a valid pairing already on the patch", () => {
    expect(
      devinFusionNormalizePatch({
        catalog,
        patch: { modelVariant: "fusion-claude-opus-5-high-sidekick-gpt-5-6-luna" },
        currentVariant: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
      }),
    ).toEqual({ modelVariant: "fusion-claude-opus-5-high-sidekick-gpt-5-6-luna" });
  });

  it("seeds the default pairing when the patch has none", () => {
    expect(devinFusionNormalizePatch({ catalog, patch: {}, currentVariant: undefined })).toEqual({
      modelVariant: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
    });
  });

  it("clamps a stale stored pairing onto the catalog", () => {
    expect(
      devinFusionNormalizePatch({
        catalog,
        patch: {},
        currentVariant: "fusion-retired-9-xhigh-sidekick-swe-9",
      }),
    ).toEqual({
      modelVariant: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
    });
  });
});

describe("formatDevinFusionPairLabel", () => {
  it("formats a pairing summary", () => {
    expect(formatDevinFusionPairLabel("fusion-claude-opus-5-high-sidekick-swe-2-medium")).toBe(
      "Claude Opus 5 High + SWE 2 Medium",
    );
    expect(
      formatDevinFusionPairLabel("fusion-gpt-6-astra-max-fast-sidekick-glm-5-2-priority"),
    ).toBe("GPT-6 Astra Max Fast + GLM 5.2 Priority");
  });

  it("returns null for non-fusion uids", () => {
    expect(formatDevinFusionPairLabel("adaptive")).toBeNull();
    expect(formatDevinFusionPairLabel(null)).toBeNull();
  });
});
