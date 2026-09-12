import type { LegendListRef } from "@legendapp/list/react";
import { ThreadId } from "@synara/contracts";
import type { WheelEvent } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useChatTranscriptScroll } from "./useChatTranscriptScroll";

it("keeps an upward wheel detached when the list reports its old end before native scrolling", async () => {
  vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame", "cancelAnimationFrame"] });
  const host = document.createElement("div");
  const viewport = document.createElement("div");
  viewport.style.cssText = "height:200px;overflow:auto;overflow-anchor:none";
  const content = document.createElement("div");
  content.style.height = "1000px";
  viewport.append(content);
  document.body.append(host, viewport);
  viewport.scrollTop = 800;
  const scrollToEnd = vi.fn(async () => {
    viewport.scrollTop = viewport.scrollHeight;
  });
  const listRef = {
    current: {
      getScrollableNode: () => viewport,
      getState: () => ({ isAtEnd: true }),
      scrollToEnd,
    } as unknown as LegendListRef,
  };
  let controller!: ReturnType<typeof useChatTranscriptScroll>;
  function Harness() {
    controller = useChatTranscriptScroll({
      activeThreadId: ThreadId.makeUnsafe("wheel-race"),
      legendListRef: listRef,
      timelineEntries: [],
      hasStreamingAssistantText: true,
      composerTranscriptInsetPx: 0,
      isInactiveSplitPane: false,
    });
    return null;
  }
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<Harness />));
    await vi.advanceTimersByTimeAsync(400);
    scrollToEnd.mockClear();
    controller.onMessagesWheelBase({ deltaY: -12, ctrlKey: false } as WheelEvent<HTMLDivElement>);
    // A list measurement can deliver this before the compositor applies the wheel.
    flushSync(() => controller.onIsAtEndChange(true));
    expect(controller.isUserScrollDetached).toBe(true);
    viewport.scrollTop -= 12;
    await vi.advanceTimersByTimeAsync(400);
    expect(controller.isUserScrollDetached).toBe(true);
    expect(scrollToEnd).not.toHaveBeenCalled();
  } finally {
    flushSync(() => root.unmount());
    host.remove();
    viewport.remove();
    vi.useRealTimers();
  }
});
