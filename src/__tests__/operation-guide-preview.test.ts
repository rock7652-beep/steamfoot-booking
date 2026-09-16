import { afterEach, expect, it, vi } from "vitest";
import { isOperationGuidePreview } from "../lib/operation-guide-preview";

afterEach(() => vi.unstubAllEnvs());

it("exposes the released guide in production without a local opt-in", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("OPERATION_GUIDE_PREVIEW", "");
  expect(isOperationGuidePreview()).toBe(true);
});

it("enables preview but requires explicit opt-in for local development", () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  expect(isOperationGuidePreview()).toBe(true);
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPERATION_GUIDE_PREVIEW", "");
  expect(isOperationGuidePreview()).toBe(false);
  vi.stubEnv("OPERATION_GUIDE_PREVIEW", "true");
  expect(isOperationGuidePreview()).toBe(true);
});
