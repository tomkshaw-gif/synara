import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  ProjectId,
  ThreadId,
} from "@synara/contracts";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const PROJECT_ID = ProjectId.makeUnsafe("project-1");
const THREAD_ID = ThreadId.makeUnsafe("thread-1");

const asEventId = (value: string) => EventId.makeUnsafe(value);

async function createThreadReadModel(now: string) {
  const withProject = await Effect.runPromise(
    projectEvent(createEmptyReadModel(now), {
      sequence: 1,
      eventId: asEventId("evt-project-create"),
      aggregateKind: "project",
      aggregateId: PROJECT_ID,
      type: "project.created",
      occurredAt: now,
      commandId: CommandId.makeUnsafe("cmd-project-create"),
      causationEventId: null,
      correlationId: CommandId.makeUnsafe("cmd-project-create"),
      metadata: {},
      payload: {
        projectId: PROJECT_ID,
        kind: "project",
        title: "Project",
        workspaceRoot: "/tmp/project",
        defaultModelSelection: null,
        scripts: [],
        createdAt: now,
        updatedAt: now,
      },
    }),
  );

  return Effect.runPromise(
    projectEvent(withProject, {
      sequence: 2,
      eventId: asEventId("evt-thread-create"),
      aggregateKind: "thread",
      aggregateId: THREAD_ID,
      type: "thread.created",
      occurredAt: now,
      commandId: CommandId.makeUnsafe("cmd-thread-create"),
      causationEventId: null,
      correlationId: CommandId.makeUnsafe("cmd-thread-create"),
      metadata: {},
      payload: {
        threadId: THREAD_ID,
        projectId: PROJECT_ID,
        title: "Thread",
        modelSelection: { provider: "codex", model: "gpt-5.6" },
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "full-access",
        envMode: "local",
        branch: null,
        worktreePath: null,
        associatedWorktreePath: null,
        associatedWorktreeBranch: null,
        associatedWorktreeRef: null,
        parentThreadId: null,
        subagentAgentId: null,
        subagentNickname: null,
        subagentRole: null,
        forkSourceThreadId: null,
        sidechatSourceThreadId: null,
        handoff: null,
        createdAt: now,
        updatedAt: now,
      },
    }),
  );
}

describe("decider thread user status", () => {
  it("passes an assigned status through thread.meta.update", async () => {
    const now = new Date().toISOString();
    const readModel = await createThreadReadModel(now);

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "thread.meta.update",
          commandId: CommandId.makeUnsafe("cmd-status-set"),
          threadId: THREAD_ID,
          userStatus: "in-review",
        },
        readModel,
      }),
    );

    const event = Array.isArray(result) ? result[0] : result;
    expect(event?.type).toBe("thread.meta-updated");
    if (!event || event.type !== "thread.meta-updated") return;
    expect(event.payload.userStatus).toBe("in-review");
  });

  it("emits an explicit null when the status is cleared", async () => {
    const now = new Date().toISOString();
    const readModel = await createThreadReadModel(now);

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "thread.meta.update",
          commandId: CommandId.makeUnsafe("cmd-status-clear"),
          threadId: THREAD_ID,
          userStatus: null,
        },
        readModel,
      }),
    );

    const event = Array.isArray(result) ? result[0] : result;
    expect(event?.type).toBe("thread.meta-updated");
    if (!event || event.type !== "thread.meta-updated") return;
    // An explicit clear must serialize as null, not be dropped — otherwise the
    // projector would preserve the previous status forever.
    expect("userStatus" in event.payload).toBe(true);
    expect(event.payload.userStatus).toBeNull();
  });

  it("leaves userStatus out of the payload when the command omits it", async () => {
    const now = new Date().toISOString();
    const readModel = await createThreadReadModel(now);

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "thread.meta.update",
          commandId: CommandId.makeUnsafe("cmd-rename-only"),
          threadId: THREAD_ID,
          title: "Renamed",
        },
        readModel,
      }),
    );

    const event = Array.isArray(result) ? result[0] : result;
    expect(event?.type).toBe("thread.meta-updated");
    if (!event || event.type !== "thread.meta-updated") return;
    expect("userStatus" in event.payload).toBe(false);
  });

  it("applies the status to the read model and preserves it across unrelated updates", async () => {
    const now = new Date().toISOString();
    const readModel = await createThreadReadModel(now);

    const setEvent = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "thread.meta.update",
          commandId: CommandId.makeUnsafe("cmd-status-set"),
          threadId: THREAD_ID,
          userStatus: "done",
        },
        readModel,
      }),
    );
    const withStatus = await Effect.runPromise(
      projectEvent(readModel, {
        ...(Array.isArray(setEvent) ? setEvent[0]! : setEvent),
        sequence: 3,
        eventId: asEventId("evt-status-set"),
      }),
    );
    expect(withStatus.threads.find((t) => t.id === THREAD_ID)?.userStatus).toBe("done");

    const renameEvent = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "thread.meta.update",
          commandId: CommandId.makeUnsafe("cmd-rename"),
          threadId: THREAD_ID,
          title: "Renamed",
        },
        readModel: withStatus,
      }),
    );
    const renamed = await Effect.runPromise(
      projectEvent(withStatus, {
        ...(Array.isArray(renameEvent) ? renameEvent[0]! : renameEvent),
        sequence: 4,
        eventId: asEventId("evt-rename"),
      }),
    );
    const thread = renamed.threads.find((t) => t.id === THREAD_ID);
    expect(thread?.title).toBe("Renamed");
    expect(thread?.userStatus).toBe("done");
  });
});
