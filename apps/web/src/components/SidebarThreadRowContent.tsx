// FILE: SidebarThreadRowContent.tsx
// Purpose: Owns the shared identity and status content rendered by every Sidebar thread row.
// Exports: SidebarThreadRowContent and its terminal-status presentation type.

import { useMemo, type ReactNode } from "react";

import { isGenericChatThreadTitle } from "@synara/shared/chatThreads";
import { pluralize } from "@synara/shared/text";

import { createThreadSelector } from "../storeSelectors";
import { useStore } from "../store";
import { resolveSubagentPresentationForThread } from "../lib/subagentPresentation";
import { resolveThreadHandoffBadgeLabel } from "../lib/threadHandoff";
import { SIDEBAR_ROW_LABEL_TEXT_CLASS_NAME } from "../sidebarRowStyles";
import type { SidebarThreadSummary } from "../types";
import { ChevronRightIcon, TerminalIcon } from "../lib/icons";
import { cn } from "../lib/utils";
import { ProviderIcon } from "./ProviderIcon";
import { SidebarGlyph } from "./sidebarGlyphs";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

export interface SidebarThreadTerminalStatus {
  label: "Terminal input needed" | "Terminal task completed" | "Terminal process running";
  colorClass: string;
  pulse: boolean;
}

function ProviderAvatarWithTerminal({
  thread,
  terminalStatus,
  terminalCount,
}: {
  thread: SidebarThreadSummary;
  terminalStatus: SidebarThreadTerminalStatus | null;
  terminalCount: number;
}) {
  const provider = thread.session?.provider ?? thread.modelSelection.provider;
  const handoffSourceProvider = thread.handoff?.sourceProvider ?? null;
  const handoffTooltip = resolveThreadHandoffBadgeLabel(thread);
  const showBadge = terminalCount > 1 || terminalStatus !== null;
  const badgeTooltip =
    terminalCount > 1
      ? `${terminalCount} ${pluralize(terminalCount, "terminal")} open`
      : (terminalStatus?.label ?? "Terminal open");
  const badgeColorClass = terminalStatus?.colorClass ?? "text-muted-foreground/55";

  const hasHandoff = Boolean(handoffSourceProvider);
  const containerClass = hasHandoff
    ? "relative inline-flex h-3 w-4.5 shrink-0 items-center"
    : "relative inline-flex size-3 shrink-0 items-center justify-center";

  const avatarNode = hasHandoff ? (
    <span className={containerClass}>
      <span className="sidebar-icon-chip absolute left-0 top-1/2 inline-flex size-3 -translate-y-1/2 items-center justify-center rounded-full">
        <ProviderIcon provider={handoffSourceProvider!} className="size-2" />
      </span>
      <span className="sidebar-icon-chip absolute right-0 top-1/2 z-10 inline-flex size-3 -translate-y-1/2 items-center justify-center rounded-full">
        <ProviderIcon provider={provider} className="size-2" />
      </span>
    </span>
  ) : (
    <span className={containerClass}>
      <ProviderIcon provider={provider} className="size-3" />
    </span>
  );

  const wrappedAvatar =
    hasHandoff && handoffTooltip ? (
      <Tooltip>
        <TooltipTrigger render={avatarNode} />
        <TooltipPopup side="top">{handoffTooltip}</TooltipPopup>
      </Tooltip>
    ) : (
      avatarNode
    );

  return (
    <span className="relative inline-flex shrink-0 items-center">
      {wrappedAvatar}
      {showBadge ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                aria-label={badgeTooltip}
                className="sidebar-icon-chip absolute -top-1.5 -right-1.5 inline-flex size-3 min-w-3 items-center justify-center rounded-full px-px"
              >
                {terminalCount > 1 ? (
                  <span
                    className={cn(
                      "text-[8px] font-semibold leading-none tabular-nums",
                      badgeColorClass,
                    )}
                  >
                    {terminalCount}
                  </span>
                ) : (
                  <TerminalIcon className={cn("size-2.5", badgeColorClass)} />
                )}
              </span>
            }
          />
          <TooltipPopup side="top">{badgeTooltip}</TooltipPopup>
        </Tooltip>
      ) : null}
    </span>
  );
}

function renderSubagentLabel(input: {
  thread: SidebarThreadSummary;
  threads?: Parameters<typeof resolveSubagentPresentationForThread>[0]["threads"];
  roleClassName?: string | undefined;
}) {
  const presentation = resolveSubagentPresentationForThread({
    thread: {
      id: input.thread.id,
      parentThreadId: input.thread.parentThreadId,
      subagentAgentId: input.thread.subagentAgentId,
      subagentNickname: input.thread.subagentNickname,
      subagentRole: input.thread.subagentRole,
      title: input.thread.title,
    },
    threads: input.threads,
  });
  const supportingLabel =
    presentation.role ??
    (presentation.nickname && presentation.title && presentation.title !== presentation.nickname
      ? presentation.title
      : null);

  return (
    <span className="min-w-0 truncate">
      <span className="font-medium" style={{ color: presentation.accentColor }}>
        {presentation.nickname ?? presentation.primaryLabel}
      </span>
      {supportingLabel ? (
        <span className={cn("ml-1 text-muted-foreground/48", input.roleClassName)}>
          {presentation.role ? `(${presentation.role})` : supportingLabel}
        </span>
      ) : null}
    </span>
  );
}

function SidebarSubagentLabel({
  thread,
  roleClassName,
}: {
  thread: SidebarThreadSummary;
  roleClassName?: string | undefined;
}) {
  const selectParentThread = useMemo(
    () => createThreadSelector(thread.parentThreadId ?? null),
    [thread.parentThreadId],
  );
  const parentThread = useStore(selectParentThread);

  return renderSubagentLabel({
    thread,
    threads: parentThread ? [parentThread] : undefined,
    roleClassName,
  });
}

export function SidebarThreadRowContent({
  thread,
  terminalEntryPoint,
  terminalStatus,
  terminalCount,
  isActive,
  variant,
  subagentIndentPx: subagentIndentPxProp,
  childDisclosure,
  pendingStatusColorClass,
  suffix,
}: {
  thread: SidebarThreadSummary;
  terminalEntryPoint: boolean;
  terminalStatus: SidebarThreadTerminalStatus | null;
  terminalCount: number;
  isActive: boolean;
  variant: "pinned" | "standard";
  subagentIndentPx?: number;
  /** Tree disclosure shown when the thread has child (subagent) rows. */
  childDisclosure?:
    | {
        childCount: number;
        expanded: boolean;
        hasLiveDescendant: boolean;
        onToggle: () => void;
      }
    | undefined;
  pendingStatusColorClass?: string | null | undefined;
  suffix?: ReactNode;
}) {
  const subagentIndentPx = subagentIndentPxProp ?? 0;
  const isSubagentThread = Boolean(thread.parentThreadId);
  const showThreadProviderAvatar = !isGenericChatThreadTitle(thread.title);

  return (
    <>
      {childDisclosure ? (
        <button
          type="button"
          aria-label={
            childDisclosure.expanded
              ? `Hide ${childDisclosure.childCount} ${pluralize(childDisclosure.childCount, "worker thread")}`
              : `Show ${childDisclosure.childCount} ${pluralize(childDisclosure.childCount, "worker thread")}`
          }
          aria-expanded={childDisclosure.expanded}
          title={
            childDisclosure.expanded
              ? "Hide worker threads"
              : `Show ${childDisclosure.childCount} ${pluralize(childDisclosure.childCount, "worker thread")}`
          }
          className={cn(
            "inline-flex h-3.5 shrink-0 items-center gap-px rounded-sm text-muted-foreground/45 transition-colors hover:text-foreground",
            childDisclosure.hasLiveDescendant && "text-muted-foreground/80",
          )}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            childDisclosure.onToggle();
          }}
        >
          <ChevronRightIcon
            className={cn(
              "size-3 transition-transform duration-150",
              childDisclosure.expanded && "rotate-90",
            )}
          />
          <span
            className={cn(
              "text-ui-xs leading-none tabular-nums",
              childDisclosure.hasLiveDescendant && "font-medium",
            )}
          >
            {childDisclosure.childCount}
          </span>
        </button>
      ) : null}
      {variant === "standard" && isSubagentThread ? (
        <span
          className="inline-flex size-3.5 shrink-0 items-center justify-center"
          style={{ marginLeft: `${subagentIndentPx}px` }}
        >
          <ProviderIcon
            provider={thread.session?.provider ?? thread.modelSelection.provider}
            className="size-3 shrink-0"
          />
        </span>
      ) : terminalEntryPoint ? (
        <SidebarGlyph icon={TerminalIcon} variant="chrome" />
      ) : showThreadProviderAvatar ? (
        <ProviderAvatarWithTerminal
          thread={thread}
          terminalStatus={terminalStatus}
          terminalCount={terminalCount}
        />
      ) : null}
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center text-left",
          variant === "standard" && isSubagentThread ? "gap-[5px]" : "gap-1.5",
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate-fade text-ui",
            isActive ? "text-foreground" : SIDEBAR_ROW_LABEL_TEXT_CLASS_NAME,
            variant === "standard" && isSubagentThread
              ? "leading-[18px] text-foreground/80"
              : "leading-5",
          )}
          data-testid={variant === "pinned" ? `thread-title-${thread.id}` : undefined}
        >
          {isSubagentThread ? (
            <SidebarSubagentLabel
              thread={thread}
              roleClassName={variant === "standard" ? "text-muted-foreground/42" : undefined}
            />
          ) : (
            thread.title
          )}
        </span>
        {!isSubagentThread && pendingStatusColorClass ? (
          <span
            aria-label="Pending approval"
            className={cn("shrink-0 text-ui-xs font-medium", pendingStatusColorClass)}
          >
            Pending
          </span>
        ) : null}
      </div>
      {suffix}
    </>
  );
}
