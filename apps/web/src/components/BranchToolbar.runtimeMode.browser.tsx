import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { RuntimeUsageControls } from "./BranchToolbar";
import "../index.css";

describe("native Auto permission picker", () => {
  for (const provider of ["devin", "grok"] as const) {
    it("offers Auto for " + provider + " and reports its distinct runtime mode", async () => {
      const onChange = vi.fn();
      const screen = await render(
        <div style={{ padding: 32, paddingTop: 400 }}>
          <RuntimeUsageControls
            provider={provider}
            providerStatus={{
              provider,
              status: "ready",
              available: true,
              authStatus: "authenticated",
              supportsAutoRuntimeMode: true,
              checkedAt: new Date(0).toISOString(),
            }}
            runtimeMode="approval-required"
            onRuntimeModeChange={onChange}
          />
        </div>,
      );
      await screen.getByRole("button").click();
      await expect
        .element(page.getByRole("menuitemradio", { name: /Approve for me/ }))
        .toBeVisible();
      await page.getByRole("menuitemradio", { name: /Approve for me/ }).click();
      expect(onChange).toHaveBeenCalledWith("auto");
    });
    it("hides Auto for " + provider + " without the capability signal", async () => {
      const screen = await render(
        <div style={{ padding: 32, paddingTop: 400 }}>
          <RuntimeUsageControls
            provider={provider}
            runtimeMode="approval-required"
            onRuntimeModeChange={vi.fn()}
          />
        </div>,
      );
      await screen.getByRole("button").click();
      await expect
        .element(page.getByRole("menuitemradio", { name: /Approve for me/ }))
        .not.toBeInTheDocument();
      await expect.element(page.getByRole("menuitemradio", { name: /Full access/ })).toBeVisible();
    });
  }
});
