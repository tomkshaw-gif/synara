// FILE: ComposerExtrasPanel.tsx
// Purpose: Composer `+` panel — one flat "Add" list (files, frontmost app window, goal, and the
//   plan / debug / fast toggles) rendered with the shared command-menu panel chrome above the
//   composer. The window row captures the frontmost app directly; its trailing arrow (or
//   ArrowRight) opens the full window list as a second view.
// Layer: Chat composer presentation
// Depends on: ComposerMenuPanel chrome, the AppSnap window picker hook, caller-owned composer state.

import type {
  DesktopAppSnapWindowEntry,
  ProviderInteractionMode,
  ProviderKind,
  ThreadId,
} from "@synara/contracts";
import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import {
  ArrowLeftIcon,
  BugIcon,
  CheckIcon,
  ChevronRightIcon,
  FastModeIcon,
  GoalIcon,
  ListTodoIcon,
  PaperclipIcon,
  UsersIcon,
  WindowIcon,
  WorkflowIcon,
} from "~/lib/icons";
import { groupFusionSidekickChoices, type FusionSidekickChoice } from "./fusionSidekickChoices";
import { cn } from "~/lib/utils";
import {
  COMPOSER_MENU_PANEL_GLYPH_CLASS_NAME,
  ComposerMenuPanel,
  type ComposerMenuPanelGroup,
  type ComposerMenuPanelRow,
} from "./ComposerMenuPanel";
import { useAppSnapWindows } from "./useAppSnapWindows";

/** Marks the `+` trigger so the panel's outside-press close does not fight the trigger's toggle. */
export const COMPOSER_EXTRAS_TRIGGER_ATTRIBUTE = "data-composer-extras-trigger";

const GLYPH = COMPOSER_MENU_PANEL_GLYPH_CLASS_NAME;

const ROW_FILES = "extras:files";
const ROW_WINDOW = "extras:window";
const ROW_GOAL = "extras:goal";
const ROW_ORCHESTRATION = "extras:orchestration";
const ROW_FUSION = "extras:fusion";
const FUSION_PROVIDER_PREFIX = "extras:fusion-provider:";
const FUSION_MODEL_PREFIX = "extras:fusion-model:";
const ROW_PLAN = "extras:mode:plan";
const ROW_DEBUG = "extras:mode:debug";
const ROW_FAST = "extras:fast";
const ROW_BACK = "extras:back";
const WINDOW_ROW_PREFIX = "extras:window:";

const CHECK = <CheckIcon className="size-3.5 text-foreground/70" />;

function toggleSecondary(label: string, enabled: boolean): string {
  return `Turn ${label} ${enabled ? "off" : "on"}`;
}

function windowGlyph(entry: DesktopAppSnapWindowEntry): ReactNode {
  return entry.appIconDataUrl ? (
    <img src={entry.appIconDataUrl} alt="" className="size-4 shrink-0 rounded-[4px]" />
  ) : (
    <WindowIcon className={GLYPH} />
  );
}

export function ComposerExtrasPanel(props: {
  interactionMode: ProviderInteractionMode;
  supportsFastMode: boolean;
  fastModeEnabled: boolean;
  threadId?: ThreadId;
  onAddAttachments: (files: File[]) => void;
  onToggleFastMode: () => void;
  onInteractionModeChange: (mode: ProviderInteractionMode) => void;
  /** Turns the draft into a `/goal` command so the goal chip flow is the same as typing it. */
  onInsertGoal: () => void;
  /** Prefixes the draft with `/orchestration` so the next send runs in orchestration mode. */
  onInsertOrchestration: () => void;
  /** Models the Fusion picker can offer as the hidden sidekick. */
  sidekickModels: readonly FusionSidekickChoice[];
  /** Writes `/fusion sidekick:<provider>/<model>` and keeps the current draft as the task. */
  onInsertFusion: (target: { provider: ProviderKind; model: string }) => void;
  onClose: () => void;
  panelId: string;
}) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<"root" | "windows" | "fusion-providers" | "fusion-models">(
    "root",
  );
  const [fusionProvider, setFusionProvider] = useState<ProviderKind | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(ROW_FILES);
  const sidekickGroups = groupFusionSidekickChoices(props.sidekickModels);

  // Listed while the panel is open (not only in the window view) so the root row can
  // name the frontmost app and capture it in one click.
  const appSnap = useAppSnapWindows({
    open: true,
    ...(props.threadId === undefined ? {} : { threadId: props.threadId }),
  });
  const firstWindow = appSnap.windows?.[0] ?? null;
  // An app can place untitled auxiliary windows above its document. Stay within
  // the first app's public identity; without it, do not guess from the app name.
  const frontmostWindow =
    (firstWindow?.bundleIdentifier
      ? appSnap.windows?.find(
          (entry) => entry.bundleIdentifier === firstWindow.bundleIdentifier && entry.windowTitle,
        )
      : null) ?? firstWindow;

  const openWindows = () => {
    setView("windows");
    setActiveRowId(ROW_BACK);
  };
  const openFusionProviders = () => {
    setView("fusion-providers");
    setActiveRowId(ROW_BACK);
  };
  const openFusionModels = (provider: ProviderKind) => {
    setFusionProvider(provider);
    setView("fusion-models");
    setActiveRowId(ROW_BACK);
  };
  const goBack = () => {
    if (view === "fusion-models") {
      setView("fusion-providers");
      setActiveRowId(fusionProvider ? `${FUSION_PROVIDER_PREFIX}${fusionProvider}` : ROW_BACK);
      return;
    }
    const returnRow = view === "windows" ? ROW_WINDOW : ROW_FUSION;
    setView("root");
    setActiveRowId(returnRow);
  };
  const selectedSidekickGroup =
    sidekickGroups.find((group) => group.provider === fusionProvider) ?? null;

  const groups: ComposerMenuPanelGroup[] =
    view === "fusion-providers" || view === "fusion-models"
      ? [fusionPickerGroup(view, sidekickGroups, selectedSidekickGroup)]
      : view === "windows"
        ? [
            {
              id: "windows",
              label: "Attach window",
              rows: [
                { id: ROW_BACK, icon: <ArrowLeftIcon className={GLYPH} />, title: "Back" },
                ...appSnapWindowRows(appSnap),
              ],
            },
          ]
        : [
            {
              id: "add",
              label: "Add",
              rows: [
                {
                  id: ROW_FILES,
                  icon: <PaperclipIcon className={GLYPH} />,
                  title: "Files and folders",
                },
                ...(appSnap.available
                  ? [
                      frontmostWindow
                        ? {
                            id: ROW_WINDOW,
                            icon: windowGlyph(frontmostWindow),
                            title: `Attach ${frontmostWindow.appName?.trim() || "window"}`,
                            disabled: appSnap.busy,
                            trailing: (
                              <button
                                type="button"
                                aria-label="Choose another window"
                                className={cn(
                                  "-mr-1 flex size-5 items-center justify-center rounded-md text-muted-foreground/60 transition-colors",
                                  "hover:bg-[var(--color-background-button-secondary)] hover:text-foreground/80",
                                )}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openWindows();
                                }}
                              >
                                <ChevronRightIcon className="size-3.5" />
                              </button>
                            ),
                          }
                        : {
                            id: ROW_WINDOW,
                            icon: <WindowIcon className={GLYPH} />,
                            title: "Attach window",
                            secondary: "Capture an open app window",
                            trailing: <ChevronRightIcon className="size-3.5" />,
                          },
                    ]
                  : []),
                {
                  id: ROW_GOAL,
                  icon: <GoalIcon className={GLYPH} />,
                  title: "Goal",
                  secondary: "Set a goal to keep pursuing",
                },
                {
                  id: ROW_ORCHESTRATION,
                  icon: <WorkflowIcon className={GLYPH} />,
                  title: "Orchestration",
                  secondary: "Split this task across supervised worker threads",
                },
                {
                  id: ROW_FUSION,
                  icon: <UsersIcon className={GLYPH} />,
                  title: "Fusion",
                  secondary: "Pair this thread's model with one hidden worker",
                  trailing: <ChevronRightIcon className="size-3.5" />,
                },
                {
                  id: ROW_PLAN,
                  icon: <ListTodoIcon className={GLYPH} />,
                  title: "Plan mode",
                  secondary: toggleSecondary("plan mode", props.interactionMode === "plan"),
                  trailing: props.interactionMode === "plan" ? CHECK : null,
                },
                {
                  id: ROW_DEBUG,
                  icon: <BugIcon className={GLYPH} />,
                  title: "Debug mode",
                  secondary: toggleSecondary("debug mode", props.interactionMode === "debug"),
                  trailing: props.interactionMode === "debug" ? CHECK : null,
                },
                ...(props.supportsFastMode
                  ? [
                      {
                        id: ROW_FAST,
                        icon: <FastModeIcon className={GLYPH} />,
                        title: "Fast mode",
                        secondary: toggleSecondary("fast mode", props.fastModeEnabled),
                        trailing: props.fastModeEnabled ? CHECK : null,
                      },
                    ]
                  : []),
              ],
            },
          ];

  const selectableRowIds = groups.flatMap((group) =>
    group.rows.filter((row) => !row.disabled).map((row) => row.id),
  );
  // Keep the highlight on a row that still exists after navigating between views.
  const highlightedRowId =
    activeRowId && selectableRowIds.includes(activeRowId)
      ? activeRowId
      : (selectableRowIds[0] ?? null);

  const selectRow = (rowId: string) => {
    if (rowId === ROW_FILES) {
      fileInputRef.current?.click();
      return;
    }
    if (rowId === ROW_WINDOW) {
      if (frontmostWindow) {
        appSnap.captureWindow(frontmostWindow.windowId);
        props.onClose();
      } else {
        openWindows();
      }
      return;
    }
    if (rowId === ROW_BACK) {
      goBack();
      return;
    }
    if (rowId === ROW_GOAL) {
      props.onInsertGoal();
      props.onClose();
      return;
    }
    if (rowId === ROW_ORCHESTRATION) {
      props.onInsertOrchestration();
      props.onClose();
      return;
    }
    if (rowId === ROW_FUSION) {
      openFusionProviders();
      return;
    }
    if (rowId.startsWith(FUSION_PROVIDER_PREFIX)) {
      const provider = rowId.slice(FUSION_PROVIDER_PREFIX.length) as ProviderKind;
      if (sidekickGroups.some((group) => group.provider === provider)) {
        openFusionModels(provider);
      }
      return;
    }
    if (rowId.startsWith(FUSION_MODEL_PREFIX)) {
      const slug = decodeURIComponent(rowId.slice(FUSION_MODEL_PREFIX.length));
      const model = selectedSidekickGroup?.models.find((entry) => entry.slug === slug);
      if (model) {
        props.onInsertFusion({ provider: model.provider, model: model.slug });
        props.onClose();
      }
      return;
    }
    if (rowId === ROW_PLAN || rowId === ROW_DEBUG) {
      const mode: ProviderInteractionMode = rowId === ROW_PLAN ? "plan" : "debug";
      props.onInteractionModeChange(props.interactionMode === mode ? "default" : mode);
      props.onClose();
      return;
    }
    if (rowId === ROW_FAST) {
      props.onToggleFastMode();
      props.onClose();
      return;
    }
    if (rowId.startsWith(WINDOW_ROW_PREFIX)) {
      const windowId = Number.parseInt(rowId.slice(WINDOW_ROW_PREFIX.length), 10);
      if (Number.isFinite(windowId)) {
        appSnap.captureWindow(windowId);
        props.onClose();
      }
    }
  };

  // The composer editor keeps focus while the panel is open so the user can keep typing;
  // the panel therefore claims only its own navigation keys, in capture phase, so Enter
  // cannot reach the composer form and send the draft.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (view === "root") {
          props.onClose();
        } else {
          goBack();
        }
        return;
      }

      if (event.key === "ArrowRight" && view === "root" && highlightedRowId === ROW_FUSION) {
        event.preventDefault();
        event.stopPropagation();
        openFusionProviders();
        return;
      }
      if (
        event.key === "ArrowRight" &&
        view === "fusion-providers" &&
        highlightedRowId?.startsWith(FUSION_PROVIDER_PREFIX)
      ) {
        event.preventDefault();
        event.stopPropagation();
        selectRow(highlightedRowId);
        return;
      }

      if (event.key === "ArrowRight" && view === "root" && highlightedRowId === ROW_WINDOW) {
        event.preventDefault();
        event.stopPropagation();
        openWindows();
        return;
      }
      if (event.key === "ArrowLeft" && view !== "root") {
        event.preventDefault();
        event.stopPropagation();
        goBack();
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (selectableRowIds.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const currentIndex = highlightedRowId ? selectableRowIds.indexOf(highlightedRowId) : -1;
        const offset = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex =
          (currentIndex + offset + selectableRowIds.length) % selectableRowIds.length;
        setActiveRowId(selectableRowIds[nextIndex] ?? null);
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        if (!highlightedRowId) return;
        event.preventDefault();
        event.stopPropagation();
        selectRow(highlightedRowId);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  });

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest(`[${COMPOSER_EXTRAS_TRIGGER_ATTRIBUTE}]`) !== null
      ) {
        return;
      }
      props.onClose();
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  });

  // Reset the hidden input so selecting the same file twice still emits a change event.
  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      props.onAddAttachments(files);
    }
    event.target.value = "";
    props.onClose();
  };

  return (
    <div ref={containerRef} id={props.panelId} data-testid="composer-extras-panel">
      <input
        id={inputId}
        ref={fileInputRef}
        data-testid="composer-file-input"
        type="file"
        multiple
        className="sr-only"
        onChange={handleFileInputChange}
      />
      <ComposerMenuPanel
        groups={groups}
        activeRowId={highlightedRowId}
        onHighlightRow={setActiveRowId}
        onSelectRow={selectRow}
      />
    </div>
  );
}

function fusionPickerGroup(
  view: "fusion-providers" | "fusion-models",
  groups: ReturnType<typeof groupFusionSidekickChoices>,
  selected: ReturnType<typeof groupFusionSidekickChoices>[number] | null,
): ComposerMenuPanelGroup {
  const back: ComposerMenuPanelRow = {
    id: ROW_BACK,
    icon: <ArrowLeftIcon className={GLYPH} />,
    title: "Back",
  };
  if (view === "fusion-providers") {
    return {
      id: "fusion-providers",
      label: "Sidekick provider",
      rows: [
        back,
        ...(groups.length === 0
          ? [
              {
                id: "extras:fusion-empty",
                title: "No worker models are available yet.",
                disabled: true,
              },
            ]
          : groups.map((group) => ({
              id: `${FUSION_PROVIDER_PREFIX}${group.provider}`,
              title: group.providerLabel,
              secondary: `${group.models.length} ${group.models.length === 1 ? "model" : "models"}`,
              trailing: <ChevronRightIcon className="size-3.5" />,
            }))),
      ],
    };
  }
  return {
    id: "fusion-models",
    label: selected ? `${selected.providerLabel} sidekick` : "Sidekick model",
    rows: [
      back,
      ...(selected && selected.models.length > 0
        ? selected.models.map((model) => ({
            id: `${FUSION_MODEL_PREFIX}${encodeURIComponent(model.slug)}`,
            title: model.name,
            secondary: model.slug === model.name ? null : model.slug,
          }))
        : [
            {
              id: "extras:fusion-empty",
              title: "No worker models for this provider.",
              disabled: true,
            },
          ]),
    ],
  };
}

function appSnapWindowRows(appSnap: ReturnType<typeof useAppSnapWindows>): ComposerMenuPanelRow[] {
  if (appSnap.unavailableMessage) {
    return [{ id: "extras:window-status", title: appSnap.unavailableMessage, disabled: true }];
  }
  if (appSnap.windows === null) {
    return [{ id: "extras:window-status", title: "Loading windows…", disabled: true }];
  }
  if (appSnap.windows.length === 0) {
    return [
      {
        id: "extras:window-status",
        title: "No other app windows are visible.",
        disabled: true,
      },
    ];
  }

  return appSnap.windows.map((entry) => ({
    id: `${WINDOW_ROW_PREFIX}${entry.windowId}`,
    icon: windowGlyph(entry),
    title: entry.appName?.trim() || "Captured app",
    secondary: entry.windowTitle?.trim() || null,
    disabled: appSnap.busy,
  }));
}
