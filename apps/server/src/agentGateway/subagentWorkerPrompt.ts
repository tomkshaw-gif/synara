// FILE: subagentWorkerPrompt.ts
// Purpose: Worker contract prepended to the first user message of a
//          spawnAs:"subagent" thread — the counterpart to the coordinator
//          playbook injected by /orchestration. The wrapped text is the durable
//          stored message, matching the automation run-envelope precedent.

export interface SubagentWorkerPromptInput {
  readonly task: string;
  readonly role?: string | undefined;
  readonly nickname?: string | undefined;
  readonly parentThreadId: string;
  readonly parentTitle: string;
}

export function buildSubagentWorkerPrompt(input: SubagentWorkerPromptInput): string {
  const identity = input.nickname ? `"${input.nickname}"` : "a worker";
  const roleLine = input.role ? `Role: ${input.role}.` : null;
  return [
    `You are ${identity}, a supervised worker thread spawned by an orchestrator thread ("${input.parentTitle}").`,
    ...(roleLine ? [roleLine] : []),
    "Work only on the assignment below — do not create threads or expand scope.",
    "Your final assistant message is delivered to the orchestrator as your report.",
    "End every run with: outcome (succeeded | failed | blocked), a concise summary, and the files you touched.",
    "If you are blocked, end your turn stating exactly what you need; the orchestrator replies on this thread.",
    "",
    "Assignment:",
    input.task,
  ].join("\n");
}
