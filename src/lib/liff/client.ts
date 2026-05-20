/**
 * LIFF client helper — 包住 @line/liff 官方 SDK。
 *
 * 只負責「初始化 + 取最常用資料」，不做身份/綁定/預約邏輯（PR-B/C/D）。
 * 全部 function SSR-safe：在 server 端（typeof window === "undefined"）呼叫會回安全預設值或拋
 * 明確錯誤，不會 throw 出 require/import 相關噪音。
 *
 * 用法（client component）：
 *   await initLiff(process.env.NEXT_PUBLIC_LIFF_ID_ZHUBEI);
 *   if (isInLineClient()) { ... }
 */

import type { Liff } from "@line/liff";

const isBrowser = (): boolean => typeof window !== "undefined";

let initPromise: Promise<Liff> | null = null;
let cachedLiff: Liff | null = null;

/**
 * 初始化 LIFF SDK。同一個 liffId 多次呼叫只會跑一次（promise 快取）。
 *
 * @throws LiffInitError 若不在 browser、liffId 為空、或 SDK init 失敗
 */
export async function initLiff(liffId: string | undefined | null): Promise<Liff> {
  if (!isBrowser()) {
    throw new LiffInitError("LIFF SDK cannot be initialized on the server");
  }
  if (!liffId) {
    throw new LiffInitError("LIFF ID is not configured");
  }
  if (initPromise) {
    return initPromise;
  }
  initPromise = (async () => {
    try {
      const mod = await import("@line/liff");
      await mod.liff.init({ liffId });
      cachedLiff = mod.liff;
      return mod.liff;
    } catch (err) {
      initPromise = null;
      cachedLiff = null;
      const message = err instanceof Error ? err.message : String(err);
      throw new LiffInitError(`liff.init failed: ${message}`, err);
    }
  })();
  return initPromise;
}

/** 是否在 LINE 內建瀏覽器中（未 init 完成時回 false）*/
export function isInLineClient(): boolean {
  if (!isBrowser() || !cachedLiff) return false;
  try {
    return cachedLiff.isInClient();
  } catch {
    return false;
  }
}

/** 取得 LIFF idToken（必須 init 完成且使用者已登入）；未就緒回 null */
export function getIDToken(): string | null {
  if (!isBrowser() || !cachedLiff) return null;
  try {
    return cachedLiff.getIDToken();
  } catch {
    return null;
  }
}

/** 取得使用者 profile（必須 init 完成且使用者已登入）；未就緒 throw */
export async function getProfile(): Promise<{
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}> {
  if (!isBrowser() || !cachedLiff) {
    throw new LiffInitError("LIFF SDK is not initialized");
  }
  return cachedLiff.getProfile();
}

/** 在 LIFF 內開新分頁（external=true 走外部瀏覽器）；非 LIFF 環境 fallback 到 window.open */
export function openWindow(url: string, external = false): void {
  if (!isBrowser()) return;
  if (cachedLiff) {
    try {
      cachedLiff.openWindow({ url, external });
      return;
    } catch {
      /* fall through */
    }
  }
  window.open(url, external ? "_blank" : "_self");
}

/** 關閉 LIFF webview；非 LIFF 環境 no-op */
export function closeWindow(): void {
  if (!isBrowser() || !cachedLiff) return;
  try {
    cachedLiff.closeWindow();
  } catch {
    /* no-op */
  }
}

export class LiffInitError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "LiffInitError";
    this.cause = cause;
  }
}

/** 測試用 — 清除 SDK 快取 */
export function __resetLiffForTest(): void {
  initPromise = null;
  cachedLiff = null;
}
