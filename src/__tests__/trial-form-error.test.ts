import { describe, expect, it, vi } from "vitest";
import { focusTrialFormError } from "@/lib/trial-form-error";

describe("trial disclosure error navigation", () => {
  function fixture() {
    const outer = { open: false, parentElement: null };
    const inner = { open: false, parentElement: { closest: () => outer } };
    const target = {
      closest: () => inner,
      scrollIntoView: vi.fn(),
      focus: vi.fn(),
    };
    const namedItem = vi.fn(() => target);
    const form = { elements: { namedItem } } as unknown as HTMLFormElement;
    return { form, outer, inner, target, namedItem };
  }
  it("opens nested panels and focuses the field without a second scroll", () => {
    const f = fixture();
    focusTrialFormError(f.form, "slug");
    expect(f.outer.open).toBe(true);
    expect(f.inner.open).toBe(true);
    expect(f.target.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      behavior: "auto",
    });
    expect(f.target.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
  it("falls back to the section progress when a notes input is not mounted", () => {
    const f = fixture();
    f.namedItem.mockImplementation((key?: string) =>
      key === "rulesNotes" ? (null as never) : f.target,
    );
    focusTrialFormError(f.form, "rulesNotes");
    expect(f.namedItem).toHaveBeenCalledWith("rulesProgress");
    expect(f.target.focus).toHaveBeenCalled();
  });
  it("does not crash when the field is unavailable", () => {
    const f = fixture();
    f.namedItem.mockReturnValue(null as never);
    expect(() => focusTrialFormError(f.form, "missing")).not.toThrow();
  });
});
