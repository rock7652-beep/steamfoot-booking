import { afterEach, expect, it, vi } from "vitest";
import { isOperationGuidePreview } from "../lib/operation-guide-preview";

afterEach(() => vi.unstubAllEnvs());

it("never exposes the guide in production, even with a local opt-in", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPERATION_GUIDE_PREVIEW", "true");
  expect(isOperationGuidePreview()).toBe(false);
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
