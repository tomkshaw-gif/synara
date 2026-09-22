import type { ContextMenuItem } from "@synara/contracts";
import { createCentralIconElement } from "./lib/central-icons";
import { isInlineSvgMenuIcon } from "./lib/nativeMenuIcons";

function createMenuIconElement(icon: string): HTMLElement | null {
  if (!isInlineSvgMenuIcon(icon)) return createCentralIconElement(icon, "opacity-60");
  const wrapper = document.createElement("span");
  wrapper.className = "flex size-4 shrink-0 items-center justify-center opacity-60 [&>svg]:size-4";
  wrapper.innerHTML = icon;
  return wrapper;
}

const CHECK_MARKUP =
  '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.5 5 9l4.5-5"/></svg>';
const CHEVRON_MARKUP =
  '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 2.5 8 6l-3.5 3.5"/></svg>';

const MENU_SURFACE_CLASS_NAME =
  "fixed z-[10000] min-w-[180px] rounded-xl border border-white/[0.08] shadow-xl animate-in fade-in zoom-in-95";
const ITEM_FOCUS_CLASS_NAME = "bg-[var(--sidebar-accent)]";

function createMenuSurface(): HTMLDivElement {
  const surface = document.createElement("div");
  surface.className = MENU_SURFACE_CLASS_NAME;
  surface.style.backgroundColor = `color-mix(in srgb, var(--popover) 90%, transparent)`;
  surface.style.backdropFilter = "blur(24px)";
  (surface.style as any).webkitBackdropFilter = "blur(24px)";
  const inner = document.createElement("div");
  inner.className = "p-1";
  surface.appendChild(inner);
  return surface;
}

function createMenuRow<T extends string>(
  item: ContextMenuItem<T>,
  options?: { reserveCheckSlot?: boolean },
): HTMLButtonElement {
  const isDestructive = item.destructive === true || item.id === "delete";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = isDestructive
    ? "flex w-full min-h-7 cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui text-foreground/86 transition-colors"
    : "flex w-full min-h-7 cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-ui text-foreground/86 transition-colors";

  if (item.checked === true) {
    btn.setAttribute("role", "menuitemradio");
    btn.setAttribute("aria-checked", "true");
    const check = document.createElement("span");
    check.className = "flex size-3.5 shrink-0 items-center justify-center text-foreground/70";
    check.setAttribute("aria-hidden", "true");
    check.innerHTML = CHECK_MARKUP;
    btn.appendChild(check);
  } else if (options?.reserveCheckSlot === true) {
    // Keep labels aligned with the checked sibling row.
    const spacer = document.createElement("span");
    spacer.className = "size-3.5 shrink-0";
    spacer.setAttribute("aria-hidden", "true");
    btn.appendChild(spacer);
  }

  const icon = item.icon ? createMenuIconElement(item.icon) : null;
  if (icon) {
    btn.appendChild(icon);
  }

  const label = document.createElement("span");
  label.textContent = item.label;
  btn.appendChild(label);

  if ((item.children?.length ?? 0) > 0) {
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    const chevron = document.createElement("span");
    chevron.className = "ml-auto flex size-3.5 shrink-0 items-center opacity-50";
    chevron.setAttribute("aria-hidden", "true");
    chevron.innerHTML = CHEVRON_MARKUP;
    btn.appendChild(chevron);
  }
  return btn;
}

function createMenuSeparator(): HTMLDivElement {
  const sep = document.createElement("div");
  sep.className = "mx-2.5 my-1 h-px bg-border";
  return sep;
}

/**
 * Imperative DOM-based context menu that matches the app's Base UI menu styling.
 * Shows a positioned dropdown and returns a promise that resolves
 * with the clicked item id, or null if dismissed. Items may carry a one-level
 * `children` flyout and a `checked` marker for the active choice.
 */
export function showContextMenuFallback<T extends string>(
  items: readonly ContextMenuItem<T>[],
  position?: { x: number; y: number },
): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999";

    const menu = createMenuSurface();
    const inner = menu.firstElementChild as HTMLDivElement;

    const x = position?.x ?? 0;
    const y = position?.y ?? 0;
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;

    let focusedIndex = -1;
    const buttons: HTMLButtonElement[] = [];

    let submenuEl: HTMLDivElement | null = null;
    let submenuParent: HTMLButtonElement | null = null;
    let submenuButtons: HTMLButtonElement[] = [];
    let submenuFocusedIndex = -1;
    let submenuCloseTimer: number | undefined;

    function cancelSubmenuClose() {
      if (submenuCloseTimer !== undefined) {
        clearTimeout(submenuCloseTimer);
        submenuCloseTimer = undefined;
      }
    }

    function closeSubmenu() {
      cancelSubmenuClose();
      submenuEl?.remove();
      submenuEl = null;
      submenuParent?.setAttribute("aria-expanded", "false");
      submenuParent = null;
      submenuButtons = [];
      submenuFocusedIndex = -1;
    }

    function scheduleSubmenuClose() {
      cancelSubmenuClose();
      // Grace window so the pointer can travel from the parent row into the flyout.
      submenuCloseTimer = window.setTimeout(() => closeSubmenu(), 150);
    }

    function cleanup(result: T | null) {
      closeSubmenu();
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      menu.remove();
      resolve(result);
    }

    function focusItem(index: number) {
      if (index < 0 || index >= buttons.length) return;
      buttons[focusedIndex]?.classList.remove(ITEM_FOCUS_CLASS_NAME);
      focusedIndex = index;
      buttons[focusedIndex]?.classList.add(ITEM_FOCUS_CLASS_NAME);
      buttons[focusedIndex]?.focus();
    }

    function focusSubmenuItem(index: number) {
      if (submenuButtons.length === 0) return;
      const clamped =
        ((index % submenuButtons.length) + submenuButtons.length) % submenuButtons.length;
      submenuButtons[submenuFocusedIndex]?.classList.remove(ITEM_FOCUS_CLASS_NAME);
      submenuFocusedIndex = clamped;
      submenuButtons[clamped]?.classList.add(ITEM_FOCUS_CLASS_NAME);
      submenuButtons[clamped]?.focus();
    }

    function openSubmenu(item: ContextMenuItem<T>, btn: HTMLButtonElement) {
      if (submenuParent === btn && submenuEl) {
        cancelSubmenuClose();
        return;
      }
      closeSubmenu();
      submenuParent = btn;
      btn.setAttribute("aria-expanded", "true");

      const surface = createMenuSurface();
      surface.style.zIndex = "10001";
      const subInner = surface.firstElementChild as HTMLDivElement;

      const children = item.children ?? [];
      const hasCheckedChild = children.some((child) => child.checked === true);
      for (let i = 0; i < children.length; i++) {
        const child = children[i]!;
        if (child.separatorBefore === true && i > 0) {
          subInner.appendChild(createMenuSeparator());
        }
        const childBtn = createMenuRow(child, { reserveCheckSlot: hasCheckedChild });
        childBtn.addEventListener("click", () => cleanup(child.id));
        childBtn.addEventListener("mouseenter", () => {
          cancelSubmenuClose();
          focusSubmenuItem(submenuButtons.indexOf(childBtn));
        });
        childBtn.addEventListener("mouseleave", () => {
          childBtn.classList.remove(ITEM_FOCUS_CLASS_NAME);
          submenuFocusedIndex = -1;
        });
        submenuButtons.push(childBtn);
        subInner.appendChild(childBtn);
      }

      const parentRect = btn.getBoundingClientRect();
      surface.style.top = `${parentRect.top - 4}px`;
      surface.style.left = `${parentRect.right - 2}px`;
      surface.addEventListener("mouseenter", cancelSubmenuClose);
      surface.addEventListener("mouseleave", scheduleSubmenuClose);
      document.body.appendChild(surface);
      submenuEl = surface;

      // Flip left / clamp when the flyout would overflow the viewport.
      requestAnimationFrame(() => {
        const rect = surface.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
          surface.style.left = `${Math.max(4, parentRect.left - rect.width + 2)}px`;
        }
        if (rect.bottom > window.innerHeight) {
          surface.style.top = `${Math.max(4, window.innerHeight - rect.height - 4)}px`;
        }
      });
    }

    function onKeyDown(e: KeyboardEvent) {
      if (submenuEl) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          focusSubmenuItem(submenuFocusedIndex + 1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          focusSubmenuItem(submenuFocusedIndex - 1);
        } else if (e.key === "Enter") {
          e.preventDefault();
          submenuButtons[submenuFocusedIndex >= 0 ? submenuFocusedIndex : 0]?.click();
        } else if (e.key === "Escape" || e.key === "ArrowLeft") {
          e.preventDefault();
          const parent = submenuParent;
          closeSubmenu();
          if (parent) {
            focusItem(buttons.indexOf(parent));
          }
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup(null);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        focusItem(focusedIndex < buttons.length - 1 ? focusedIndex + 1 : 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusItem(focusedIndex > 0 ? focusedIndex - 1 : buttons.length - 1);
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (focusedIndex < 0 || focusedIndex >= items.length) return;
        const item = items[focusedIndex]!;
        if ((item.children?.length ?? 0) > 0) {
          openSubmenu(item, buttons[focusedIndex]!);
          focusSubmenuItem(0);
        } else if (e.key === "Enter") {
          cleanup(item.id);
        }
      }
    }

    overlay.addEventListener("mousedown", () => cleanup(null));
    document.addEventListener("keydown", onKeyDown);

    const hasCheckedItem = items.some((item) => item.checked === true);
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const isDestructive = item.destructive === true || item.id === "delete";

      // Keep explicit groups visible in the browser fallback; destructive items remain isolated by default.
      if ((item.separatorBefore === true || isDestructive) && i > 0) {
        inner.appendChild(createMenuSeparator());
      }

      const btn = createMenuRow(item, { reserveCheckSlot: hasCheckedItem });
      const hasChildren = (item.children?.length ?? 0) > 0;
      if (hasChildren) {
        btn.addEventListener("click", () => {
          openSubmenu(item, btn);
          focusSubmenuItem(submenuFocusedIndex >= 0 ? submenuFocusedIndex : 0);
        });
        btn.addEventListener("mouseenter", () => {
          openSubmenu(item, btn);
          focusItem(buttons.indexOf(btn));
        });
        btn.addEventListener("mouseleave", () => {
          btn.classList.remove(ITEM_FOCUS_CLASS_NAME);
          focusedIndex = -1;
          scheduleSubmenuClose();
        });
      } else {
        btn.addEventListener("click", () => cleanup(item.id));
        btn.addEventListener("mouseenter", () => {
          closeSubmenu();
          focusItem(buttons.length > 0 ? buttons.indexOf(btn) : 0);
        });
        btn.addEventListener("mouseleave", () => {
          btn.classList.remove(ITEM_FOCUS_CLASS_NAME);
          focusedIndex = -1;
        });
      }
      buttons.push(btn);
      inner.appendChild(btn);
    }

    document.body.appendChild(overlay);
    document.body.appendChild(menu);

    // Adjust if menu overflows viewport
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 4}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 4}px`;
      }
    });
  });
}
