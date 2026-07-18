import { afterEach, describe, expect, it } from "vitest";
import { PRODUCTION_LINE_CALLBACK_URL, resolveTaichungCallbackUrl } from "@/lib/line-oauth/callback-url";

const original = { VERCEL_ENV: process.env.VERCEL_ENV, VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL, VERCEL_URL: process.env.VERCEL_URL };
afterEach(() => Object.assign(process.env, original));

describe("Taichung LINE callback URL allowlist", () => {
  it("fixes production to the registered www callback and rejects other hosts", () => {
    process.env.VERCEL_ENV = "production";
    expect(resolveTaichungCallbackUrl("www.steamfoot.com")).toBe(PRODUCTION_LINE_CALLBACK_URL);
    expect(resolveTaichungCallbackUrl("steamfoot.com")).toBeNull();
    expect(resolveTaichungCallbackUrl("attacker.example")).toBeNull();
  });
  it("allows only the exact current Vercel preview hosts", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_BRANCH_URL = "booking-git-line-oauth.vercel.app";
    process.env.VERCEL_URL = "booking-abc.vercel.app";
    expect(resolveTaichungCallbackUrl("booking-git-line-oauth.vercel.app")).toBe("https://booking-git-line-oauth.vercel.app/api/auth/callback/line");
    expect(resolveTaichungCallbackUrl("unknown.vercel.app")).toBeNull();
  });
});
