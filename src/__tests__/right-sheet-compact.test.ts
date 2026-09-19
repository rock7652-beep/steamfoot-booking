// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RightSheet } from "@/components/admin/right-sheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; document.body.style.overflow = ""; });

describe("RightSheet compatibility and compact keyboard behavior", () => {
  for (const compact of [false, true]) {
    it(`${compact ? "compact" : "existing"} sheet locks background and restores it on close`, async () => {
      const trigger = document.createElement("button");
      const host = document.createElement("div");
      document.body.append(trigger, host);
      trigger.focus();
      document.body.style.overflow = "auto";
      vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{ width: 80, height: 44 }] as unknown as DOMRectList);
      const onClose = vi.fn();
      const root = createRoot(host);
      // The repository test glob is .ts only; explicit children satisfy the required component props.
      // eslint-disable-next-line react/no-children-prop
      await act(async () => root.render(React.createElement(RightSheet, { open: true, compact, onClose, children: [React.createElement("button", { key: "cancel" }, "Cancel"), React.createElement("button", { key: "save" }, "Save")] })));
      const buttons = host.querySelectorAll("button");
      expect(document.body.style.overflow).toBe("hidden");
      if (compact) {
        expect(document.activeElement).toBe(buttons[0]);
        buttons[1].focus();
        buttons[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(buttons[0]);
      } else {
        expect(document.activeElement).toBe(trigger);
      }
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(onClose).toHaveBeenCalledTimes(1);
      await act(async () => root.unmount());
      expect(document.body.style.overflow).toBe("auto");
      expect(document.activeElement).toBe(trigger);
    });
  }
});
