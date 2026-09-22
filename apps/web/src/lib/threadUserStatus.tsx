// FILE: threadUserStatus.tsx
// Purpose: Registry for the user-assigned thread triage status ("Move to Status"):
//          ordered ids, display labels, colors, and the shared SVG glyph used by
//          the sidebar trailing slot and the context-menu icons.
// Layer: Web UI domain helper
// Exports: THREAD_USER_STATUSES, THREAD_USER_STATUS_META, isThreadUserStatus,
//          ThreadUserStatusIcon

import type { ThreadUserStatus } from "@synara/contracts";

import { cn } from "~/lib/utils";

export const THREAD_USER_STATUSES: readonly ThreadUserStatus[] = [
  "todo",
  "in-progress",
  "in-review",
  "done",
];

export interface ThreadUserStatusMeta {
  /** Sidebar pill label and context-menu row label. */
  label: "Todo" | "In progress" | "In review" | "Done";
  /** Foreground color of the SVG glyph (drives `currentColor`). */
  colorClass: string;
  /** Fallback dot color when a surface renders `ThreadStatusPill.dotClass`. */
  dotClass: string;
}

export const THREAD_USER_STATUS_META: Record<ThreadUserStatus, ThreadUserStatusMeta> = {
  todo: {
    label: "Todo",
    colorClass: "text-slate-500 dark:text-slate-400",
    dotClass: "bg-slate-500 dark:bg-slate-400",
  },
  "in-progress": {
    label: "In progress",
    colorClass: "text-amber-600 dark:text-amber-300/90",
    dotClass: "bg-amber-500 dark:bg-amber-300/90",
  },
  "in-review": {
    label: "In review",
    colorClass: "text-violet-600 dark:text-violet-300/90",
    dotClass: "bg-violet-500 dark:bg-violet-300/90",
  },
  done: {
    label: "Done",
    colorClass: "text-emerald-600 dark:text-emerald-300/90",
    dotClass: "bg-emerald-500 dark:bg-emerald-300/90",
  },
};

export function isThreadUserStatus(value: string): value is ThreadUserStatus {
  return (THREAD_USER_STATUSES as readonly string[]).includes(value);
}

/**
 * Linear-style status glyph: dashed ring (Todo), half-filled ring (In progress),
 * ring with filled center (In review), filled check circle (Done).
 */
export function ThreadUserStatusIcon({
  status,
  className,
}: {
  status: ThreadUserStatus;
  className?: string;
}) {
  const colorClass = THREAD_USER_STATUS_META[status].colorClass;
  if (status === "done") {
    return (
      <svg viewBox="0 0 14 14" className={cn("size-3 shrink-0", colorClass, className)} aria-hidden>
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path
          d="M4.1 7.4 6.15 9.4 9.9 4.9"
          fill="none"
          stroke="var(--color-background-surface, white)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === "in-progress") {
    return (
      <svg viewBox="0 0 14 14" className={cn("size-3 shrink-0", colorClass, className)} aria-hidden>
        <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M7 3.5 A3.5 3.5 0 0 1 7 10.5 Z" fill="currentColor" />
      </svg>
    );
  }
  if (status === "in-review") {
    return (
      <svg viewBox="0 0 14 14" className={cn("size-3 shrink-0", colorClass, className)} aria-hidden>
        <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="7" cy="7" r="2.4" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 14 14" className={cn("size-3 shrink-0", colorClass, className)} aria-hidden>
      <circle
        cx="7"
        cy="7"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeDasharray="2 2.2"
      />
    </svg>
  );
}
