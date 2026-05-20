/**
 * src/lib/liff/client.ts 行為測試。
 *
 * vitest config 是 environment: "node"，預設 typeof window === "undefined"，
 * 等同 server 端。對 browser-only 路徑用 vi.stubGlobal("window", ...) 模擬。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 必須在 import client.ts 之前 mock @line/liff
const mockInit = vi.fn();
const mockIsInClient = vi.fn();
const mockGetIDToken = vi.fn();
const mockGetProfile = vi.fn();
const mockOpenWindow = vi.fn();
const mockCloseWindow = vi.fn();

vi.mock("@line/liff", () => ({
  liff: {
    init: mockInit,
    isInClient: mockIsInClient,
    getIDToken: mockGetIDToken,
    getProfile: mockGetProfile,
    openWindow: mockOpenWindow,
    closeWindow: mockCloseWindow,
  },
}));

import {
  __resetLiffForTest,
  closeWindow,
  getIDToken,
  initLiff,
  isInLineClient,
  LiffInitError,
  openWindow,
} from "@/lib/liff/client";

describe("liff client wrapper", () => {
  beforeEach(() => {
    __resetLiffForTest();
    mockInit.mockReset();
    mockIsInClient.mockReset();
    mockGetIDToken.mockReset();
    mockGetProfile.mockReset();
    mockOpenWindow.mockReset();
    mockCloseWindow.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("SSR safety (no window)", () => {
    it("initLiff throws LiffInitError on server", async () => {
      await expect(initLiff("test-id")).rejects.toBeInstanceOf(LiffInitError);
    });

    it("isInLineClient returns false on server", () => {
      expect(isInLineClient()).toBe(false);
    });

    it("getIDToken returns null on server", () => {
      expect(getIDToken()).toBeNull();
    });

    it("openWindow is no-op on server (no throw)", () => {
      expect(() => openWindow("https://example.com")).not.toThrow();
    });

    it("closeWindow is no-op on server (no throw)", () => {
      expect(() => closeWindow()).not.toThrow();
    });
  });

  describe("with window (browser-like)", () => {
    beforeEach(() => {
      vi.stubGlobal("window", { open: vi.fn() });
    });

    it("initLiff rejects when liffId is empty", async () => {
      await expect(initLiff("")).rejects.toBeInstanceOf(LiffInitError);
      await expect(initLiff(null)).rejects.toBeInstanceOf(LiffInitError);
      await expect(initLiff(undefined)).rejects.toBeInstanceOf(LiffInitError);
      expect(mockInit).not.toHaveBeenCalled();
    });

    it("initLiff resolves and caches SDK reference", async () => {
      mockInit.mockResolvedValueOnce(undefined);
      await initLiff("liff-123");
      expect(mockInit).toHaveBeenCalledWith({ liffId: "liff-123" });

      // 第二次呼叫不應 re-init
      await initLiff("liff-123");
      expect(mockInit).toHaveBeenCalledTimes(1);
    });

    it("initLiff wraps SDK errors into LiffInitError", async () => {
      mockInit.mockRejectedValueOnce(new Error("network failed"));
      const caught = await initLiff("liff-123").catch((e: unknown) => e);
      expect(caught).toBeInstanceOf(LiffInitError);
      expect((caught as LiffInitError).message).toMatch(/network failed/);
    });

    it("initLiff retries after a failure (promise cache cleared)", async () => {
      mockInit.mockRejectedValueOnce(new Error("transient"));
      await initLiff("liff-123").catch(() => {});
      mockInit.mockResolvedValueOnce(undefined);
      await expect(initLiff("liff-123")).resolves.toBeDefined();
      expect(mockInit).toHaveBeenCalledTimes(2);
    });

    it("isInLineClient uses cached SDK after init", async () => {
      mockInit.mockResolvedValueOnce(undefined);
      mockIsInClient.mockReturnValue(true);
      await initLiff("liff-123");
      expect(isInLineClient()).toBe(true);
    });

    it("isInLineClient returns false before init", () => {
      expect(isInLineClient()).toBe(false);
      expect(mockIsInClient).not.toHaveBeenCalled();
    });

    it("getIDToken returns null before init", () => {
      expect(getIDToken()).toBeNull();
    });

    it("getIDToken returns SDK value after init", async () => {
      mockInit.mockResolvedValueOnce(undefined);
      mockGetIDToken.mockReturnValue("token-abc");
      await initLiff("liff-123");
      expect(getIDToken()).toBe("token-abc");
    });

    it("openWindow fallbacks to window.open when SDK not init'd", () => {
      const win = window as unknown as { open: ReturnType<typeof vi.fn> };
      openWindow("https://example.com");
      expect(win.open).toHaveBeenCalledWith("https://example.com", "_self");
      expect(mockOpenWindow).not.toHaveBeenCalled();
    });

    it("openWindow uses SDK after init", async () => {
      mockInit.mockResolvedValueOnce(undefined);
      await initLiff("liff-123");
      openWindow("https://example.com", true);
      expect(mockOpenWindow).toHaveBeenCalledWith({ url: "https://example.com", external: true });
    });

    it("closeWindow uses SDK after init; no-op before", async () => {
      closeWindow();
      expect(mockCloseWindow).not.toHaveBeenCalled();

      mockInit.mockResolvedValueOnce(undefined);
      await initLiff("liff-123");
      closeWindow();
      expect(mockCloseWindow).toHaveBeenCalledTimes(1);
    });
  });
});
