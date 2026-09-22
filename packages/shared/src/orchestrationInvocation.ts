// FILE: orchestrationInvocation.ts
// Purpose: `/orchestration` user command — detection and the coordinator playbook
//          injected into the provider-bound prompt. The literal token stays in the
//          durable message for provenance (mirrors computerInvocation.ts); the
//          provider receives the expanded playbook instead.

export const ORCHESTRATION_SLASH_COMMAND = "orchestration";

/** Only a command at the start of the user's message is an invocation. */
export function parseOrchestrationInvocation(text: string | undefined): { prompt: string } | null {
  if (!text) return null;
  // Four spaces or a tab are Markdown code indentation, not a command. Quotes,
  // fenced code, attachment blocks and mentions elsewhere never match.
  const match = /^ {0,3}\/orchestration(?:[ \t\r\n]+([\s\S]*))?$/i.exec(text);
  return match ? { prompt: (match[1] ?? "").trim() } : null;
}

export const ORCHESTRATION_FALLBACK_TASK = "Coordinate this request across supervised workers.";

/**
 * The coordinator playbook a `/orchestration` turn runs under. It teaches the
 * spawning, waiting, escalation, and synthesis loop on top of the synara_*
 * tools; `spawnAs:"subagent"` does the actual parent binding server-side.
 */
export function buildOrchestrationCoordinatorPrompt(task: string): string {
  const objective = task.trim().length > 0 ? task.trim() : ORCHESTRATION_FALLBACK_TASK;
  return [
    "Orchestration mode: you are the coordinator. Run this task across supervised Synara worker threads.",
    "",
    "Coordinator loop:",
    "1. Decompose the request into independent, well-scoped assignments (usually 2-6). Keep the fan-out shallow and only split work that benefits from parallel workers.",
    '2. Submit ONE synara_create_threads call with one item per worker. Each item sets spawnAs:"subagent", a short role (for example "implementer", "reviewer", "researcher", "tester"), a nickname, and a self-contained prompt — workers see none of this conversation, so include exact file paths, constraints, and the expected deliverable. Prefer environment:"worktree" for workers that edit code.',
    "3. Workers nest under this thread in the sidebar. Record the returned thread ids, then call synara_wait_for_threads on all of them. On timeout, wait again — never create replacement threads for a plan that already dispatched.",
    "4. A worker that ends its turn without a clear outcome is blocked: inspect it with synara_read_thread, reply via synara_send_message to unblock it, then keep waiting.",
    "5. When every worker is terminal, synthesize all outcomes into one report: what each worker did, files changed, failures, and remaining follow-ups. Do not end your turn while workers are still running without saying so explicitly.",
    "",
    "Task:",
    objective,
  ].join("\n");
}
