import type { ThreadId } from "@synara/contracts";
import { Effect, Option } from "effect";

import type { ProjectionSnapshotQueryShape } from "./Services/ProjectionSnapshotQuery.ts";

const SYNTHETIC_PROVIDER_SUBAGENT_ID_PREFIX = "subagent:";

/**
 * Provider-native subagent mirrors use `subagent:<parent>:<providerThreadId>`.
 * They run inside the parent CLI.
 */
export function isSyntheticProviderSubagentThreadId(threadId: string): boolean {
  return threadId.startsWith(SYNTHETIC_PROVIDER_SUBAGENT_ID_PREFIX);
}

/**
 * True when this thread's turns must start their own provider process.
 * Gateway workers and sidekicks (`creationSource` synara_mcp / external_mcp)
 * are independent sessions even though they hang under a parent thread.
 * Every other child, including native subagent mirrors, shares the parent CLI.
 */
export function threadOwnsProviderSession(thread: {
  readonly id: string;
  readonly parentThreadId?: string | null | undefined;
  readonly creationSource?: string | null | undefined;
}): boolean {
  // Synthetic ids share the parent even when parentThreadId was not persisted.
  // The resolver then finds that parent from the id prefix.
  if (isSyntheticProviderSubagentThreadId(thread.id)) {
    return false;
  }
  if (thread.parentThreadId == null) {
    return true;
  }
  return thread.creationSource === "synara_mcp" || thread.creationSource === "external_mcp";
}

/**
 * Resolves the projection thread that owns provider-session side effects.
 * Lookup failures intentionally propagate: falling back to the child id on a
 * transient failure would let independent reactors choose different lease keys.
 *
 * Shell reads only: this runs once (often several times) per provider intent
 * event and once per queued thread in drain/scan loops, and every consumer
 * reads just `id`, `session`, `modelSelection`, `parentThreadId`, and
 * `creationSource`. Loading
 * and decoding the full transcript here was pure over-fetching.
 *
 * Gateway workers own their session. Folding them onto the parent lease makes
 * the first turn wait until the coordinator turn ends: the row stays on
 * Starting and no provider process is spawned. Other children still share
 * the parent CLI.
 */
export function resolveProviderSessionThread(
  projectionSnapshotQuery: ProjectionSnapshotQueryShape,
  threadId: ThreadId,
) {
  return Effect.gen(function* () {
    const thread = Option.getOrNull(yield* projectionSnapshotQuery.getThreadShellById(threadId));
    if (thread === null) {
      return null;
    }
    if (threadOwnsProviderSession(thread)) {
      return thread;
    }
    if (thread.parentThreadId) {
      return (
        Option.getOrNull(
          yield* projectionSnapshotQuery.getThreadShellById(thread.parentThreadId),
        ) ?? thread
      );
    }
    return (
      Option.getOrNull(
        yield* projectionSnapshotQuery.findSyntheticSubagentParentThread(thread.id),
      ) ?? thread
    );
  });
}
