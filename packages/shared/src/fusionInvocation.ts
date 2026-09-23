// FILE: fusionInvocation.ts
// Purpose: `/fusion` user command — detection and the lead playbook injected
//          into the provider-bound prompt. The literal token stays in the
//          durable message for provenance (mirrors orchestrationInvocation.ts);
//          the provider receives the expanded playbook instead.
//
// The lead is whatever model the thread is already running. The sidekick is
// one worker model named in the command. `spawnAs:"sidekick"` binds and hides
// that worker server-side.

import { ProviderKind, type ProviderKind as ProviderKindName } from "@synara/contracts";

export const FUSION_SLASH_COMMAND = "fusion";

/** Reserved `subagentRole`. Sidebar lists drop threads that carry it. */
export const FUSION_SIDEKICK_ROLE = "fusion-sidekick";

export const FUSION_SIDEKICK_NICKNAME = "Sidekick";

export function isFusionSidekickRole(role: string | null | undefined): boolean {
  return role === FUSION_SIDEKICK_ROLE;
}

export interface FusionSidekickTarget {
  readonly provider: ProviderKindName;
  readonly model: string;
}

export interface FusionInvocation {
  readonly sidekick: FusionSidekickTarget | null;
  readonly prompt: string;
}

const FUSION_PROVIDERS_BY_LENGTH = [...ProviderKind.literals].sort(
  (left, right) => right.length - left.length,
);

/** Only a command at the start of the user's message is an invocation. */
export function parseFusionInvocation(text: string | undefined): FusionInvocation | null {
  if (!text) return null;
  // Four spaces or a tab are Markdown code indentation, not a command. Quotes,
  // fenced code, attachment blocks and mentions elsewhere never match.
  const match = /^ {0,3}\/fusion(?:[ \t\r\n]+([\s\S]*))?$/i.exec(text);
  if (!match) return null;
  const body = (match[1] ?? "").trim();
  const sidekickLead = /^sidekick:(\S+)(?:[ \t\r\n]+([\s\S]*))?$/i.exec(body);
  if (!sidekickLead) {
    return { sidekick: null, prompt: body };
  }
  const sidekick = parseSidekickToken(sidekickLead[1] ?? "");
  if (!sidekick) {
    return { sidekick: null, prompt: body };
  }
  return { sidekick, prompt: (sidekickLead[2] ?? "").trim() };
}

function parseSidekickToken(token: string): FusionSidekickTarget | null {
  const lower = token.toLowerCase();
  for (const provider of FUSION_PROVIDERS_BY_LENGTH) {
    const prefix = `${provider.toLowerCase()}/`;
    if (!lower.startsWith(prefix)) continue;
    const model = token.slice(prefix.length).trim();
    if (model.length === 0) return null;
    return { provider, model };
  }
  return null;
}

export function buildFusionSlashCommand(target: FusionSidekickTarget, task: string): string {
  const token = `sidekick:${target.provider}/${target.model}`;
  const trimmed = task.trim();
  return trimmed.length > 0
    ? `/${FUSION_SLASH_COMMAND} ${token} ${trimmed}`
    : `/${FUSION_SLASH_COMMAND} ${token} `;
}

export const FUSION_FALLBACK_TASK = "Carry out this request with the sidekick.";

/**
 * The lead playbook a `/fusion` turn runs under. One hidden sidekick does the
 * mechanical work; the lead plans, reviews, and answers.
 */
export function buildFusionLeadPrompt(invocation: FusionInvocation): string {
  const task =
    invocation.prompt.trim().length > 0 ? invocation.prompt.trim() : FUSION_FALLBACK_TASK;
  if (!invocation.sidekick) {
    return [
      "Fusion mode was requested without a sidekick model.",
      "Ask the user to resend with a worker model, for example /fusion sidekick:codex/gpt-5.4-mini <task>.",
      "Do not create threads and do not guess a provider or model slug.",
      "",
      "Task:",
      task,
    ].join("\n");
  }
  const target = JSON.stringify({
    provider: invocation.sidekick.provider,
    model: invocation.sidekick.model,
  });
  return [
    "Fusion mode: you are the lead on this thread. You plan, review, and write the user-facing answer. One hidden sidekick does the mechanical work on the worker model below.",
    "",
    "Lead loop:",
    '1. Submit ONE synara_create_threads call with exactly one item. Set spawnAs:"sidekick", set target to the JSON object below, and write a self-contained prompt with exact file paths, constraints, and the deliverable. The sidekick sees none of this conversation. Omit role, nickname, projectId, and environment so the sidekick uses the current thread checkout. Use a fresh requestId for this task.',
    "2. If that call fails before it returns an operationId, correct the plan and reuse the same requestId. After an operationId, do not create another thread.",
    "3. The sidekick stays hidden from the sidebar. Record its thread id, then call synara_wait_for_threads on it. On timeout, wait again.",
    "4. If the sidekick ends blocked, inspect it with synara_read_thread, reply with synara_send_message, and wait again.",
    "5. You own the answer. Synthesize what changed, what failed, and what remains. Do not end the turn while the sidekick is still running without saying so.",
    "",
    "Sidekick target:",
    target,
    "",
    "Task:",
    task,
  ].join("\n");
}
