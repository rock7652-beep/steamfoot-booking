import { describe, expect, it, vi } from "vitest";
import { completeTaichungLineLogin } from "@/lib/line-oauth/taichung-completion-client";

describe("Taichung LINE completion client handoff", () => {
  it("calls completion and redirects only after both bridge sign-in and completion succeed", async () => {
    const signIn = vi.fn().mockResolvedValue({ ok: true });
    const complete = vi.fn().mockResolvedValue({ ok: true });
    const redirect = vi.fn();

    await expect(completeTaichungLineLogin({ callbackUrl: "/s/taichung/book", signIn, complete, redirect })).resolves.toEqual({ ok: true });
    expect(complete).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/s/taichung/book");
  });

  it("does not call completion or redirect when bridge sign-in fails", async () => {
    const complete = vi.fn();
    const redirect = vi.fn();

    await expect(completeTaichungLineLogin({ callbackUrl: "/s/taichung/book", signIn: vi.fn().mockResolvedValue({ ok: false }), complete, redirect })).resolves.toEqual({ ok: false, error: "sign_in_failed" });
    expect(complete).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not redirect or report success when completion rejects", async () => {
    const redirect = vi.fn();

    await expect(completeTaichungLineLogin({ callbackUrl: "/s/taichung/book", signIn: vi.fn().mockResolvedValue({ ok: true }), complete: vi.fn().mockResolvedValue({ ok: false }), redirect })).resolves.toEqual({ ok: false, error: "completion_failed" });
    expect(redirect).not.toHaveBeenCalled();
  });
});
