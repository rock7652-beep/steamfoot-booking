import { afterAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const m = vi.hoisted(() => ({ context: vi.fn(), presentation: vi.fn() }));
vi.mock("@/lib/store-context", () => ({ getStoreContext: m.context }));
vi.mock("@/lib/store-resolver", () => ({ resolveStorePresentation: m.presentation }));
vi.mock("@/components/app-link", () => ({ AppLink: (props: React.ComponentProps<"a">) => React.createElement("a", props) }));
import { NoPlanEmptyState } from "@/components/no-plan-empty-state";
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
describe("no-plan contact isolation", () => {
  it("does not send an unconfigured trial store to another store's LINE", async () => {
    m.context.mockResolvedValue({ storeSlug: "trial-test" });
    m.presentation.mockResolvedValue({ contactUrl: "" });
    const html = renderToStaticMarkup(await NoPlanEmptyState({ shopHref: "/s/trial-test/book/shop" }));
    expect(html).not.toContain("lin.ee");
    expect(html).not.toContain("聯繫店長（LINE）");
    expect(html).toContain("/s/trial-test/book/shop");
  });
  it("uses the current store's configured contact", async () => {
    m.context.mockResolvedValue({ storeSlug: "configured-test" });
    m.presentation.mockResolvedValue({ contactUrl: "https://line.me/R/ti/p/@test-store" });
    const html = renderToStaticMarkup(await NoPlanEmptyState({}));
    expect(m.presentation).toHaveBeenLastCalledWith("configured-test");
    expect(html).toContain("https://line.me/R/ti/p/@test-store");
  });
});
