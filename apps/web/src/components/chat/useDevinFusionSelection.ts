// FILE: useDevinFusionSelection.ts
// Purpose: Shared Devin Fusion lead+sidekick selection state for every trait
//   surface (model-picker footer, traits menu). Returns null when the selected
//   model is not a Fusion family.
// Layer: Chat composer state hook
// Depends on: the fusion catalog helpers and the shared trait commit path.

import type {
  DevinModelOptions,
  ProviderKind,
  ProviderModelDescriptor,
  ThreadId,
} from "@synara/contracts";

import {
  buildDevinFusionCatalog,
  type DevinFusionCatalog,
  type DevinFusionChoice,
  devinFusionChoiceFromUid,
  devinFusionUidForChoice,
  resolveDevinFusionChoice,
} from "~/lib/devinFusion";
import type { ProviderOptions } from "../../providerModelOptions";
import { useComposerTraitCommit } from "./useComposerTraitCommit";

export interface DevinFusionSelection {
  readonly catalog: DevinFusionCatalog;
  readonly choice: DevinFusionChoice;
  /** Clamps the patch onto the catalog matrix and commits the composed uid. */
  readonly commitChoice: (patch: Partial<DevinFusionChoice>) => void;
}

export function useDevinFusionSelection(input: {
  provider: ProviderKind;
  threadId: ThreadId;
  model: string | null | undefined;
  modelOptions: ProviderOptions | null | undefined;
  runtimeModel?: ProviderModelDescriptor | undefined;
}): DevinFusionSelection | null {
  const catalog =
    input.provider === "devin" ? buildDevinFusionCatalog(input.runtimeModel?.modelVariants) : null;
  const commitTrait = useComposerTraitCommit({
    threadId: input.threadId,
    provider: input.provider,
    model: input.model,
    modelOptions: input.modelOptions,
  });
  if (catalog === null) {
    return null;
  }
  const choice = resolveDevinFusionChoice(
    catalog,
    devinFusionChoiceFromUid((input.modelOptions as DevinModelOptions | undefined)?.modelVariant),
  );
  if (choice === null) {
    return null;
  }
  return {
    catalog,
    choice,
    commitChoice: (patch) => {
      const next = resolveDevinFusionChoice(catalog, { ...choice, ...patch });
      if (next !== null) {
        commitTrait({ modelVariant: devinFusionUidForChoice(next) });
      }
    },
  };
}
