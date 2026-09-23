// FILE: fusionSidekickChoices.ts
// Purpose: Turn the composer model catalog into the Fusion sidekick picker.
//          Devin's own fusion pairing uids are not worker models.

import type { ProviderKind } from "@synara/contracts";

export interface FusionSidekickChoice {
  readonly provider: ProviderKind;
  readonly providerLabel: string;
  readonly slug: string;
  readonly name: string;
}

export interface FusionSidekickProviderGroup {
  readonly provider: ProviderKind;
  readonly providerLabel: string;
  readonly models: readonly FusionSidekickChoice[];
}

export function isSelectableFusionSidekick(choice: FusionSidekickChoice): boolean {
  const slug = choice.slug.trim();
  if (slug.length === 0 || choice.name.trim().length === 0) return false;
  const lower = slug.toLowerCase();
  return lower !== "fusion" && !lower.startsWith("fusion-");
}

/** First-seen provider order, one row per slug. */
export function groupFusionSidekickChoices(
  choices: readonly FusionSidekickChoice[],
): readonly FusionSidekickProviderGroup[] {
  const groups = new Map<ProviderKind, { providerLabel: string; models: FusionSidekickChoice[] }>();
  for (const choice of choices) {
    if (!isSelectableFusionSidekick(choice)) continue;
    const existing = groups.get(choice.provider);
    if (!existing) {
      groups.set(choice.provider, { providerLabel: choice.providerLabel, models: [choice] });
      continue;
    }
    if (existing.models.some((model) => model.slug === choice.slug)) continue;
    existing.models.push(choice);
  }
  return [...groups.entries()].map(([provider, group]) => ({
    provider,
    providerLabel: group.providerLabel,
    models: group.models,
  }));
}
