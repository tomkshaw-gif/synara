// FILE: contextMenuIcons.tsx
// Purpose: Icons for imperative context menus, matching the glyphs the same actions use in React UI.
// Layer: web UI utility
// Exports: THREAD_CONTEXT_MENU_ICONS
// Why: Native menus cannot render React components, so Central glyphs are passed by basename and
//      other icon sets are rendered to SVG markup from the same components the app shows.

import { renderToStaticMarkup } from "react-dom/server";

import { THREAD_ARCHIVE_ICON } from "~/components/ThreadArchiveActionButton";
import {
  BELL_ICON_NAME,
  COPY_ICON_NAME,
  EYE_OPEN_ICON_NAME,
  HANDOFF_ICON_NAME,
  PENCIL_ICON_NAME,
  PIN_ICON_NAME,
  TERMINAL_ICON_NAME,
  Trash2,
} from "./icons";
import { ThreadUserStatusIcon } from "./threadUserStatus";
import type { ThreadUserStatus } from "@synara/contracts";

export const THREAD_CONTEXT_MENU_ICONS = {
  rename: PENCIL_ICON_NAME,
  pin: PIN_ICON_NAME,
  clearNotification: BELL_ICON_NAME,
  markUnread: EYE_OPEN_ICON_NAME,
  // Same glyph language as the sidebar status dot: a neutral dashed ring.
  moveToStatus: renderToStaticMarkup(<ThreadUserStatusIcon status="todo" className="size-4" />),
  handoff: HANDOFF_ICON_NAME,
  copy: COPY_ICON_NAME,
  openInTerminal: TERMINAL_ICON_NAME,
  // Same glyph as the thread row's hover archive button.
  archive: renderToStaticMarkup(<THREAD_ARCHIVE_ICON size={24} />),
  // Same glyph as the delete rows in the sidebar project and space menus.
  delete: renderToStaticMarkup(<Trash2 />),
} as const;

const THREAD_USER_STATUS_MENU_ICON_MARKUP: Record<ThreadUserStatus, string> = {
  todo: renderToStaticMarkup(<ThreadUserStatusIcon status="todo" className="size-4" />),
  "in-progress": renderToStaticMarkup(
    <ThreadUserStatusIcon status="in-progress" className="size-4" />,
  ),
  "in-review": renderToStaticMarkup(<ThreadUserStatusIcon status="in-review" className="size-4" />),
  done: renderToStaticMarkup(<ThreadUserStatusIcon status="done" className="size-4" />),
};

/** Menu icon for a "Move to Status" submenu row — same glyph as the sidebar dot. */
export function threadUserStatusMenuIcon(status: ThreadUserStatus): string {
  return THREAD_USER_STATUS_MENU_ICON_MARKUP[status];
}
