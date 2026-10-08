import { describe, expect, it, vi } from "vitest";
import { trialGuides } from "@/lib/trial-guides";
const navigation = vi.hoisted(() => ({ redirect: vi.fn(() => { throw new Error("redirect"); }), notFound: vi.fn(() => { throw new Error("notFound"); }) }));
vi.mock("next/navigation", () => navigation);
import Page from "@/app/pricing/trial/guide/[topic]/page";

describe("trial setup guidance", () => {
  it("keeps official-account help without collecting Developers access", () => {
    expect(trialGuides["oa-admin"].title).toBe("官方 LINE 管理員邀請");
    expect(trialGuides).not.toHaveProperty("developers");
    expect(JSON.stringify(trialGuides)).not.toMatch(/Developers|Provider|Channel|Send invitation/);
  });
  it("redirects saved Developers help links to the official-account guide", async () => {
    await expect(Page({ params: Promise.resolve({ topic: "developers" }) })).rejects.toThrow("redirect");
    expect(navigation.redirect).toHaveBeenCalledWith("/pricing/trial/guide/oa-admin");
  });
  it("renders the official-account guide and rejects unknown topics", async () => {
    expect(await Page({ params: Promise.resolve({ topic: "oa-admin" }) })).toBeTruthy();
    await expect(Page({ params: Promise.resolve({ topic: "missing" }) })).rejects.toThrow("notFound");
  });
});
