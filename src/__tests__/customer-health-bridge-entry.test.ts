import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/server/actions/liff-health", () => ({
  createHealthflowEntryUrl: vi.fn(),
}));

import { HealthflowEntryButton, startHealthflowEntryNavigation } from "@/app/(customer)/health/healthflow-entry-button";
import { createHealthflowBridgeState, verifyHealthflowBridgeState } from "@/lib/healthflow-identity-bridge";

describe("/s/[store]/health HealthFlow entry CTA", () => {
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
    });
    const navigate = vi.fn();

    await expect(
      startHealthflowEntryNavigation({
        storeSlug: "zhubei",
        createEntryUrl,
        navigate,
      }),
    ).resolves.toBe("navigated");

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
    });
    const navigate = vi.fn();

    await expect(
      startHealthflowEntryNavigation({
        storeSlug: "zhubei",
        createEntryUrl,
        navigate,
      }),
    ).resolves.toBe("failed");

    expect(createEntryUrl).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("ignores duplicate clicks while an entry request is in flight", async () => {
    let resolveAction!: (value: { status: "ok"; url: string }) => void;
    const createEntryUrl = vi.fn(
      () =>
        new Promise<{ status: "ok"; url: string }>((resolve) => {
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

    await expect(second).resolves.toBe("ignored");
    expect(createEntryUrl).toHaveBeenCalledOnce();

    resolveAction({
      status: "ok",
      url: "https://liff.line.me/2009744225-9aSc04fR/liff?state=signed",
    });

    await expect(first).resolves.toBe("navigated");
    expect(navigate).toHaveBeenCalledOnce();
  });
});
