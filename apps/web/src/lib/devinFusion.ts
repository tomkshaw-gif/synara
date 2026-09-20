// FILE: devinFusion.ts
// Purpose: Structured Devin Fusion lead+sidekick selection, derived from the
//   discovered `modelVariants` uids (fusion-<lead>-<effort>[-fast]-sidekick-<x>).
// Layer: Web model-selection helpers
// Depends on: shared Fusion uid parse/compose helpers.

import {
  composeDevinFusionModelUid,
  humanizeModelSlug,
  type DevinFusionModelParts,
  parseDevinFusionModelUid,
} from "@synara/shared/model";
import type { ProviderModelVariantDescriptor } from "@synara/contracts";

export interface DevinFusionPair {
  readonly uid: string;
  readonly lead: string;
  readonly effort: string;
  readonly fast: boolean;
  /** Full sidekick token including the `-priority` fast-tier suffix. */
  readonly sidekick: string;
}

export interface DevinFusionChoice {
  readonly lead: string;
  readonly effort: string;
  readonly fast: boolean;
  readonly sidekick: string;
}

export interface DevinFusionCatalog {
  readonly pairs: ReadonlyArray<DevinFusionPair>;
  readonly uids: ReadonlySet<string>;
}

const DEVIN_FUSION_EFFORT_ORDER: ReadonlyArray<string> = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

const DEVIN_FUSION_EFFORT_LABELS: Readonly<Record<string, string>> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
};

function sidekickToken(parts: DevinFusionModelParts): string {
  return `${parts.sidekick}${parts.sidekickPriority ? "-priority" : ""}`;
}

/** Parses every fusion uid out of a runtime descriptor's variant list. */
export function buildDevinFusionCatalog(
  variants: ReadonlyArray<ProviderModelVariantDescriptor> | null | undefined,
): DevinFusionCatalog | null {
  const pairs = (variants ?? []).flatMap((variant) => {
    const parts = parseDevinFusionModelUid(variant.model);
    return parts === null
      ? []
      : [
          {
            uid: variant.model,
            lead: parts.lead,
            effort: parts.leadEffort,
            fast: parts.fast,
            sidekick: sidekickToken(parts),
          },
        ];
  });
  return pairs.length > 0 ? { pairs, uids: new Set(pairs.map((pair) => pair.uid)) } : null;
}

function sortEfforts(efforts: Iterable<string>): string[] {
  return [...new Set(efforts)].toSorted(
    (left, right) =>
      DEVIN_FUSION_EFFORT_ORDER.indexOf(left) - DEVIN_FUSION_EFFORT_ORDER.indexOf(right),
  );
}

export function devinFusionLeads(catalog: DevinFusionCatalog): string[] {
  return [...new Set(catalog.pairs.map((pair) => pair.lead))];
}

export function devinFusionEffortsFor(catalog: DevinFusionCatalog, lead: string): string[] {
  return sortEfforts(catalog.pairs.filter((pair) => pair.lead === lead).map((pair) => pair.effort));
}

export function devinFusionSupportsFast(
  catalog: DevinFusionCatalog,
  lead: string,
  effort: string,
): boolean {
  return catalog.pairs.some((pair) => pair.lead === lead && pair.effort === effort && pair.fast);
}

export function devinFusionSidekicksFor(
  catalog: DevinFusionCatalog,
  lead: string,
  effort: string,
  fast: boolean,
): string[] {
  return [
    ...new Set(
      catalog.pairs
        .filter((pair) => pair.lead === lead && pair.effort === effort && pair.fast === fast)
        .map((pair) => pair.sidekick),
    ),
  ];
}

/**
 * Clamps a partial choice onto the catalog's validity matrix: lead first, then
 * the lead's effort ladder, fast tier, and finally the sidekicks that pairing
 * actually offers. Defaults follow the catalog order, which mirrors what
 * `devin --model fusion` picks.
 */
export function resolveDevinFusionChoice(
  catalog: DevinFusionCatalog,
  choice: Partial<DevinFusionChoice>,
): DevinFusionChoice | null {
  const leads = devinFusionLeads(catalog);
  const lead = choice.lead !== undefined && leads.includes(choice.lead) ? choice.lead : leads[0];
  if (lead === undefined) {
    return null;
  }

  const efforts = devinFusionEffortsFor(catalog, lead);
  const effort =
    choice.effort !== undefined && efforts.includes(choice.effort)
      ? choice.effort
      : (efforts.find((value) => value === "medium") ?? efforts[0]);
  if (effort === undefined) {
    return null;
  }

  const fast = choice.fast === true && devinFusionSupportsFast(catalog, lead, effort);

  const sidekicks = devinFusionSidekicksFor(catalog, lead, effort, fast);
  const sidekick =
    choice.sidekick !== undefined && sidekicks.includes(choice.sidekick)
      ? choice.sidekick
      : sidekicks[0];
  if (sidekick === undefined) {
    return null;
  }

  return { lead, effort, fast, sidekick };
}

export function devinFusionChoiceFromUid(
  uid: string | null | undefined,
): Partial<DevinFusionChoice> {
  const parts = parseDevinFusionModelUid(uid);
  if (parts === null) {
    return {};
  }
  return {
    lead: parts.lead,
    effort: parts.leadEffort,
    fast: parts.fast,
    sidekick: sidekickToken(parts),
  };
}

export function devinFusionUidForChoice(choice: DevinFusionChoice): string {
  const sidekickPriority = choice.sidekick.endsWith("-priority");
  return composeDevinFusionModelUid({
    lead: choice.lead,
    leadEffort: choice.effort,
    fast: choice.fast,
    sidekick: sidekickPriority ? choice.sidekick.slice(0, -"-priority".length) : choice.sidekick,
    sidekickPriority,
  });
}

export function devinFusionLeadLabel(lead: string): string {
  return humanizeModelSlug(lead);
}

export function devinFusionEffortLabel(effort: string): string {
  return DEVIN_FUSION_EFFORT_LABELS[effort] ?? humanizeModelSlug(effort);
}

export function devinFusionSidekickLabel(sidekick: string): string {
  return humanizeModelSlug(sidekick);
}

/**
 * `/fast`-style toggle for a Fusion selection: rewrites the pairing uid's fast
 * marker instead of writing a dead `fastMode` trait. Null when the model is
 * not a Fusion family or has no fast tier, so the caller can fall back to the
 * generic trait commit.
 */
export function devinFusionFastModePatch(input: {
  modelVariants: ReadonlyArray<ProviderModelVariantDescriptor> | null | undefined;
  modelVariant: string | null | undefined;
  fast: boolean;
}): Record<string, unknown> | null {
  const catalog = buildDevinFusionCatalog(input.modelVariants);
  if (catalog === null) {
    return null;
  }
  const choice = resolveDevinFusionChoice(catalog, {
    ...devinFusionChoiceFromUid(input.modelVariant),
    fast: input.fast,
  });
  if (choice === null || choice.fast !== input.fast) {
    return null;
  }
  return { modelVariant: devinFusionUidForChoice(choice) };
}

/**
 * Normalizes a Devin options patch for the model family being committed: a
 * Fusion family must carry a concrete pairing uid (kept verbatim when already
 * valid, otherwise clamped from the current pairing onto the catalog), while a
 * non-Fusion family must never inherit a stale `modelVariant`.
 */
export function devinFusionNormalizePatch(input: {
  catalog: DevinFusionCatalog | null;
  patch: Record<string, unknown>;
  currentVariant: string | null | undefined;
}): Record<string, unknown> {
  const { catalog, patch } = input;
  if (catalog === null) {
    return { ...patch, modelVariant: undefined };
  }
  if (
    typeof patch.modelVariant === "string" &&
    parseDevinFusionModelUid(patch.modelVariant) !== null
  ) {
    return patch;
  }
  const choice = resolveDevinFusionChoice(catalog, devinFusionChoiceFromUid(input.currentVariant));
  return {
    ...patch,
    modelVariant: choice === null ? undefined : devinFusionUidForChoice(choice),
  };
}

/** "Claude Opus 5 High + SWE-2 Medium" — the pairing summary for a fusion uid. */
export function formatDevinFusionPairLabel(uid: string | null | undefined): string | null {
  const parts = parseDevinFusionModelUid(uid);
  if (parts === null) {
    return null;
  }
  const fast = parts.fast ? " Fast" : "";
  return `${devinFusionLeadLabel(parts.lead)} ${devinFusionEffortLabel(parts.leadEffort)}${fast} + ${devinFusionSidekickLabel(sidekickToken(parts))}`;
}
