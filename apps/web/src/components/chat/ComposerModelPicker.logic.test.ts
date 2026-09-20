import { describe, expect, it } from "vitest";
import { type ProviderKind } from "@synara/contracts";

import {
  normalizeStarredModels,
  starredModelKey,
  toggleStarredModel,
  type StarredModel,
} from "~/lib/starredModels";
import {
  buildStarredTabRows,
  buildStarredModelOptionsPatch,
  formatStarredTraitsLabel,
  modelPickerShortcutRowIndex,
  resolveStarredTraits,
  starredTraitsMatch,
} from "./ComposerModelPicker.logic";
import { getComposerTraitSelection } from "./composerTraits";
import { type ProviderModelOption } from "../../providerModelOptions";

const CODEX_HIGH_FAST: StarredModel = {
  provider: "codex",
  model: "gpt-5.5",
  effort: "high",
  fastMode: true,
  thinking: null,
  modelVariant: null,
};

const EMPTY_MODEL_OPTIONS: Record<ProviderKind, ReadonlyArray<ProviderModelOption>> = {
  codex: [],
  claudeAgent: [],
  cursor: [],
  devin: [],
  antigravity: [],
  grok: [],
  droid: [],
  opencode: [],
  pi: [],
};

describe("starred model presets", () => {
  it.each([
    { options: [], expectedModel: null },
    { options: [{ slug: "gpt-5.6-sol", name: "GPT-5.6 Sol" }], expectedModel: null },
    { options: [{ slug: "gpt-5.5", name: "GPT-5.5" }], expectedModel: "gpt-5.5" },
  ])("only enables presets present in the current catalog: %j", ({ options, expectedModel }) => {
    const [row] = buildStarredTabRows({
      starredModels: [CODEX_HIGH_FAST],
      modelOptionsByProvider: { ...EMPTY_MODEL_OPTIONS, codex: options },
      query: "",
      current: CODEX_HIGH_FAST,
      effortLevelsFor: () => [],
    });

    expect(row?.selectableModel).toBe(expectedModel);
    expect(row?.selected).toBe(expectedModel !== null);
    expect(row?.preset).toBe(CODEX_HIGH_FAST);
    if (expectedModel === null) expect(row?.detail).toBe("Unavailable");
  });

  it("snapshots the traits currently resolved for a model", () => {
    const selection = getComposerTraitSelection("codex", "gpt-5.5", "", {
      reasoningEffort: "high",
      fastMode: true,
    });
    expect(resolveStarredTraits(selection)).toEqual({
      effort: "high",
      fastMode: true,
      thinking: null,
      modelVariant: null,
    });
  });

  it("round-trips a preset back into a provider option patch", () => {
    const selection = getComposerTraitSelection("codex", "gpt-5.5", "", undefined);
    expect(
      buildStarredModelOptionsPatch({ provider: "codex", selection, starred: CODEX_HIGH_FAST }),
    ).toEqual({ reasoningEffort: "high", fastMode: true });
  });

  it("skips traits the target model does not expose", () => {
    const selection = getComposerTraitSelection("codex", "gpt-5.5", "", undefined);
    expect(
      buildStarredModelOptionsPatch({
        provider: "codex",
        selection,
        starred: { effort: "not-a-level", fastMode: null, thinking: false, modelVariant: null },
      }),
    ).toEqual({});
  });

  it("labels a preset through the model's effort ladder", () => {
    const { effortLevels } = getComposerTraitSelection("codex", "gpt-5.5", "", undefined);
    expect(formatStarredTraitsLabel(CODEX_HIGH_FAST, effortLevels)).toBe("High · Fast");
    expect(
      formatStarredTraitsLabel(
        { effort: null, fastMode: null, thinking: null, modelVariant: null },
        effortLevels,
      ),
    ).toBe("");
  });

  it("keeps one star per model + traits combination", () => {
    const lowEffort = { ...CODEX_HIGH_FAST, effort: "low" };
    const both = toggleStarredModel(toggleStarredModel([], CODEX_HIGH_FAST), lowEffort);
    expect(both.map(starredModelKey)).toEqual([
      starredModelKey(CODEX_HIGH_FAST),
      starredModelKey(lowEffort),
    ]);
    expect(toggleStarredModel(both, CODEX_HIGH_FAST)).toEqual([lowEffort]);
  });

  it("drops stored entries for unknown providers and duplicates", () => {
    expect(
      normalizeStarredModels([
        CODEX_HIGH_FAST,
        CODEX_HIGH_FAST,
        { ...CODEX_HIGH_FAST, provider: "retired-provider" },
      ]),
    ).toEqual([CODEX_HIGH_FAST]);
  });

  const DEVIN_FUSION_PRESET: StarredModel = {
    provider: "devin",
    model: "fusion",
    effort: null,
    fastMode: null,
    thinking: null,
    modelVariant: "fusion-claude-opus-5-high-sidekick-swe-2-medium",
  };

  it("restores a Fusion preset as modelVariant only", () => {
    const selection = getComposerTraitSelection("devin", "fusion", "", undefined);
    expect(
      buildStarredModelOptionsPatch({
        provider: "devin",
        selection,
        starred: DEVIN_FUSION_PRESET,
      }),
    ).toEqual({ modelVariant: "fusion-claude-opus-5-high-sidekick-swe-2-medium" });
  });

  it("labels a Fusion preset with its pairing summary", () => {
    expect(formatStarredTraitsLabel(DEVIN_FUSION_PRESET, [])).toBe(
      "Claude Opus 5 High + SWE 2 Medium",
    );
  });

  it("matches a Fusion preset only when the same pairing is current", () => {
    const scrubbed = { effort: null, fastMode: null, thinking: null };
    expect(
      starredTraitsMatch(DEVIN_FUSION_PRESET, {
        ...scrubbed,
        modelVariant: "fusion-claude-opus-5-high-sidekick-swe-2-medium",
      }),
    ).toBe(true);
    expect(
      starredTraitsMatch(DEVIN_FUSION_PRESET, {
        ...scrubbed,
        modelVariant: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
      }),
    ).toBe(false);
    expect(starredTraitsMatch(DEVIN_FUSION_PRESET, { ...scrubbed, modelVariant: null })).toBe(
      false,
    );
  });

  it("keeps separate stars for different Fusion pairings", () => {
    const other = {
      ...DEVIN_FUSION_PRESET,
      modelVariant: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
    };
    expect(starredModelKey(other)).not.toBe(starredModelKey(DEVIN_FUSION_PRESET));
  });

  it("fills modelVariant on entries stored before pairings were starred", () => {
    const { modelVariant: _modelVariant, ...legacy } = CODEX_HIGH_FAST;
    expect(normalizeStarredModels([legacy])).toEqual([CODEX_HIGH_FAST]);
  });
});

describe("modelPickerShortcutRowIndex", () => {
  const base = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };

  it("maps mod+digit to a zero-based row", () => {
    expect(modelPickerShortcutRowIndex({ ...base, key: "1", metaKey: true })).toBe(0);
    expect(modelPickerShortcutRowIndex({ ...base, key: "9", ctrlKey: true })).toBe(8);
  });

  it("ignores bare digits and other chords", () => {
    expect(modelPickerShortcutRowIndex({ ...base, key: "1" })).toBeNull();
    expect(modelPickerShortcutRowIndex({ ...base, key: "0", metaKey: true })).toBeNull();
    expect(
      modelPickerShortcutRowIndex({ ...base, key: "2", metaKey: true, altKey: true }),
    ).toBeNull();
  });
});
