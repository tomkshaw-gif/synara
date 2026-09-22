import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  ProjectId,
  ThreadId,
  type OrchestrationReadModel,
  type OrchestrationThread,
} from "@synara/contracts";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const NOW = "2026-07-25T18:00:00.000Z";
const PROJECT_ID = ProjectId.makeUnsafe("project-subagent");
const OTHER_PROJECT_ID = ProjectId.makeUnsafe("project-other");
const PARENT_ID = ThreadId.makeUnsafe("thread-parent");

function makeThread(
  id: string,
  overrides?: Partial<OrchestrationThread>,
): OrchestrationThread {
  return {
    id: ThreadId.makeUnsafe(id),
    projectId: PROJECT_ID,
    title: `Thread ${id}`,
    modelSelection: { provider: "codex", model: "gpt-5.6" },
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    runtimeMode: "approval-required",
    branch: null,
    worktreePath: null,
    createdAt: NOW,
    updatedAt: NOW,
    latestTurn: null,
    handoff: null,
    messages: [],
    session: null,
    activities: [],
    proposedPlans: [],
    checkpoints: [],
    deletedAt: null,
    ...overrides,
  };
}

async function makeReadModel(
  projects: ReadonlyArray<{ id: ProjectId; workspaceRoot: string }>,
  threads: OrchestrationThread[],
): Promise<OrchestrationReadModel> {
  let readModel = createEmptyReadModel(NOW);
  let sequence = 0;
  for (const project of projects) {
    sequence += 1;
    readModel = await Effect.runPromise(
      projectEvent(readModel, {
        sequence,
        eventId: EventId.makeUnsafe(`evt-project-create-${project.id}`),
        aggregateKind: "project",
        aggregateId: project.id,
        type: "project.created",
        occurredAt: NOW,
        commandId: CommandId.makeUnsafe(`cmd-project-create-${project.id}`),
        causationEventId: null,
        correlationId: CommandId.makeUnsafe(`cmd-project-create-${project.id}`),
        metadata: {},
        payload: {
          projectId: project.id,
          kind: "project",
          title: `Project ${project.id}`,
          workspaceRoot: project.workspaceRoot,
          defaultModelSelection: null,
          scripts: [],
          createdAt: NOW,
          updatedAt: NOW,
        },
      }),
    );
  }
  return { ...readModel, threads };
}

function createChildCommand(input: {
  threadId?: string;
  parentThreadId?: ThreadId | null;
  projectId?: ProjectId;
  creationSource?: "synara_mcp" | "provider_native";
}) {
  return {
    type: "thread.create" as const,
    commandId: CommandId.makeUnsafe(`cmd-create-${input.threadId ?? "child"}`),
    threadId: ThreadId.makeUnsafe(input.threadId ?? "thread-child"),
    projectId: input.projectId ?? PROJECT_ID,
    title: "Child worker",
    modelSelection: { provider: "codex" as const, model: "gpt-5.6" },
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    runtimeMode: "approval-required" as const,
    envMode: "local" as const,
    branch: null,
    worktreePath: null,
    createBranchFlowCompleted: false,
    parentThreadId: input.parentThreadId ?? PARENT_ID,
    creationSource: input.creationSource ?? ("synara_mcp" as const),
    createdAt: NOW,
  };
}

describe("decider subagent parent validation", () => {
  it("creates a thread under a live same-project parent", async () => {
    const readModel = await makeReadModel(
      [{ id: PROJECT_ID, workspaceRoot: "/tmp/project" }],
      [makeThread("thread-parent")],
    );

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: createChildCommand({}),
        readModel,
      }),
    );

    const event = Array.isArray(result) ? result[0] : result;
    expect(event?.type).toBe("thread.created");
    if (event?.type === "thread.created") {
      expect(event.payload.parentThreadId).toBe(PARENT_ID);
    }
  });

  it("rejects a missing parent thread", async () => {
    const readModel = await makeReadModel([{ id: PROJECT_ID, workspaceRoot: "/tmp/project" }], []);

    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          command: createChildCommand({}),
          readModel,
        }),
      ),
    ).rejects.toThrow("does not exist");
  });

  it("rejects an archived parent thread", async () => {
    const readModel = await makeReadModel(
      [{ id: PROJECT_ID, workspaceRoot: "/tmp/project" }],
      [makeThread("thread-parent", { archivedAt: NOW })],
    );

    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          command: createChildCommand({}),
          readModel,
        }),
      ),
    ).rejects.toThrow("already archived");
  });

  it("rejects a parent in a different project", async () => {
    const readModel = await makeReadModel(
      [
        { id: PROJECT_ID, workspaceRoot: "/tmp/project" },
        { id: OTHER_PROJECT_ID, workspaceRoot: "/tmp/other" },
      ],
      [makeThread("thread-parent", { projectId: OTHER_PROJECT_ID })],
    );

    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          command: createChildCommand({}),
          readModel,
        }),
      ),
    ).rejects.toThrow("different project");
  });

  it("rejects a child that would exceed the nesting depth cap", async () => {
    // root -> level-1 -> level-2 -> level-3 is already at the maximum.
    const readModel = await makeReadModel(
      [{ id: PROJECT_ID, workspaceRoot: "/tmp/project" }],
      [
        makeThread("thread-root"),
        makeThread("thread-level-1", { parentThreadId: ThreadId.makeUnsafe("thread-root") }),
        makeThread("thread-level-2", {
          parentThreadId: ThreadId.makeUnsafe("thread-level-1"),
        }),
        makeThread("thread-level-3", {
          parentThreadId: ThreadId.makeUnsafe("thread-level-2"),
        }),
      ],
    );

    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          command: createChildCommand({
            threadId: "thread-level-4",
            parentThreadId: ThreadId.makeUnsafe("thread-level-3"),
          }),
          readModel,
        }),
      ),
    ).rejects.toThrow("limited to 3 levels");
  });

  it("allows a child at exactly the nesting depth cap", async () => {
    const readModel = await makeReadModel(
      [{ id: PROJECT_ID, workspaceRoot: "/tmp/project" }],
      [
        makeThread("thread-root"),
        makeThread("thread-level-1", { parentThreadId: ThreadId.makeUnsafe("thread-root") }),
        makeThread("thread-level-2", {
          parentThreadId: ThreadId.makeUnsafe("thread-level-1"),
        }),
      ],
    );

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: createChildCommand({
          threadId: "thread-level-3",
          parentThreadId: ThreadId.makeUnsafe("thread-level-2"),
        }),
        readModel,
      }),
    );

    const event = Array.isArray(result) ? result[0] : result;
    expect(event?.type).toBe("thread.created");
  });

  it("skips the parent check for provider-native mirrors", async () => {
    // Provider-native threads mirror subagents the provider already runs; the
    // parent may legitimately be absent from the projection.
    const readModel = await makeReadModel([{ id: PROJECT_ID, workspaceRoot: "/tmp/project" }], []);

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: createChildCommand({
          parentThreadId: PARENT_ID,
          creationSource: "provider_native",
        }),
        readModel,
      }),
    );

    const event = Array.isArray(result) ? result[0] : result;
    expect(event?.type).toBe("thread.created");
  });
});
