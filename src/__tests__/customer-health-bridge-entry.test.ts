import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/server/actions/liff-health", () => ({
  createHealthflowEntryUrl: vi.fn(),
}));

import {
  formatHealthflowEntryErrorCode,
  getHealthflowEntryErrorMessage,
  HealthflowEntryButton,
  startHealthflowEntryNavigation,
} from "@/app/(customer)/health/healthflow-entry-button";
import { createHealthflowBridgeState, verifyHealthflowBridgeState } from "@/lib/healthflow-identity-bridge";

describe("/s/[store]/health HealthFlow entry CTA", () => {
  it.each([
    ["no_customer", "目前無法辨識顧客資料，請重新登入或聯繫門市。"],
    ["store_mismatch", "目前登入資料與此門市不一致，請由原門市入口進入。"],
    ["feature_unavailable", "此門市目前尚未開放健康評估。"],
    ["service_unavailable", "健康評估服務暫時無法使用，請稍後再試。"],
  ] as const)("maps %s to actionable customer copy", (status, message) => {
    expect(getHealthflowEntryErrorMessage(status)).toBe(message);
  });

  it("formats a short support code without exposing the full request id", () => {
    const requestId = "hf_entry_12345678-abcd-4000-9000-abcdef12ab34";

    expect(formatHealthflowEntryErrorCode(requestId)).toBe("HF-12AB34");
    expect(formatHealthflowEntryErrorCode(requestId)).not.toContain(requestId);
  });

  it("renders a button instead of a fixed HealthFlow URL", () => {
    const html = renderToStaticMarkup(
      createElement(HealthflowEntryButton, { storeSlug: "zhubei" }),
    );

    expect(html).toContain("前往量測");
    expect(html).not.toContain("https://www.healthflow-ai.com/liff");
    expect(html).not.toContain("customerId=");
    expect(html).not.toContain("https://liff.line.me/2009744225-9aSc04fR");
  });

  it("calls the signed entry action for the current store and navigates to the returned LIFF URL", async () => {
    vi.stubEnv("HEALTHFLOW_BRIDGE_SECRET", "test-healthflow-bridge-secret");
    const state = await createHealthflowBridgeState({
      customerId: "customer_1",
      storeId: "store_zhubei",
    });
    const signedUrl = `https://liff.line.me/2009744225-9aSc04fR/liff?state=${encodeURIComponent(
      state,
    )}`;
    const createEntryUrl = vi.fn().mockResolvedValue({
      status: "ok",
      url: signedUrl,
      requestId: "hf_entry_success123456",
    });
    const navigate = vi.fn();

    await expect(
      startHealthflowEntryNavigation({
        storeSlug: "zhubei",
        createEntryUrl,
        navigate,
      }),
    ).resolves.toEqual({ outcome: "navigated" });

    expect(createEntryUrl).toHaveBeenCalledOnce();
    expect(createEntryUrl).toHaveBeenCalledWith("zhubei");
    expect(navigate).toHaveBeenCalledWith(signedUrl);

    const url = new URL(signedUrl);
    expect(url.pathname).toBe("/2009744225-9aSc04fR/liff");
    expect(url.searchParams.getAll("state")).toHaveLength(1);

    const verified = await verifyHealthflowBridgeState(url.searchParams.get("state"));
    expect(verified).toMatchObject({
      ok: true,
      payload: {
        customerId: "customer_1",
        storeId: "store_zhubei",
      },
    });

    vi.unstubAllEnvs();
  });

  it("does not navigate when the signed entry action fails", async () => {
    const createEntryUrl = vi.fn().mockResolvedValue({
      status: "store_mismatch",
      requestId: "hf_entry_mismatch123456",
    });
    const navigate = vi.fn();

    await expect(
      startHealthflowEntryNavigation({
        storeSlug: "zhubei",
        createEntryUrl,
        navigate,
      }),
    ).resolves.toEqual({
      outcome: "failed",
      status: "store_mismatch",
      requestId: "hf_entry_mismatch123456",
    });

    expect(createEntryUrl).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("ignores duplicate clicks while an entry request is in flight", async () => {
    let resolveAction!: (value: {
      status: "ok";
      url: string;
      requestId: string;
    }) => void;
    const createEntryUrl = vi.fn(
      () =>
        new Promise<{ status: "ok"; url: string; requestId: string }>((resolve) => {
          resolveAction = resolve;
        }),
    );
    const navigate = vi.fn();
    const inFlightRef = { current: false };

    const first = startHealthflowEntryNavigation({
      storeSlug: "zhubei",
      createEntryUrl,
      navigate,
      inFlightRef,
    });
    const second = startHealthflowEntryNavigation({
      storeSlug: "zhubei",
      createEntryUrl,
      navigate,
      inFlightRef,
    });

    await expect(second).resolves.toEqual({ outcome: "ignored" });
    expect(createEntryUrl).toHaveBeenCalledOnce();

    resolveAction({
      status: "ok",
      url: "https://liff.line.me/2009744225-9aSc04fR/liff?state=signed",
      requestId: "hf_entry_success654321",
    });

    await expect(first).resolves.toEqual({ outcome: "navigated" });
    expect(navigate).toHaveBeenCalledOnce();
  });
});
