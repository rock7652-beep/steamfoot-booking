import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("not found"); },
}));
vi.mock("@/lib/store-resolver", () => ({
  resolveStoreSlugForLiff: async () => "endpoint",
  resolveStoreBySlug: async (slug: string) => slug === "missing" ? null : { slug },
  resolveCentralMemberLiffId: async (slug: string) => slug === "separate" ? "separate-app" : "shared-app",
}));
vi.mock("@/app/(liff)/liff/resume/resume-entry", () => ({
  LiffResumeEntry: () => null,
}));

import { renderLiffResume } from "@/app/(liff)/liff/resume/render-resume";

it("initializes the same LIFF app for both official redirect phases", async () => {
  const request = { store: "warm", next: "/s/warm/liff/health?tab=history" };
  for (const primary of [true, false]) {
    const page = await renderLiffResume(request, primary);
    expect(page.props).toEqual({ liffId: "shared-app", storeSlug: "warm", target: request.next, primary });
  }
});

it.each([
  { store: "separate", next: "/s/separate/liff" },
  { store: "missing", next: "/s/missing/liff" },
  { store: "warm", next: "/s/endpoint/liff" },
  { store: "warm", next: "/s/warm/admin/dashboard" },
])("rejects a return outside the requested member route and channel: %j", async (request) => {
  await expect(renderLiffResume(request, false)).rejects.toThrow("not found");
});
