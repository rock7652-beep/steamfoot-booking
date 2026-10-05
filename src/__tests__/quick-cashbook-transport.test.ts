import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
const m = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/server/actions/quick-cashbook", () => ({ fetchQuickCashbook: m.read }));
import { GET } from "@/app/api/cashbook/quick/route";
import { readQuickCashbook } from "@/lib/quick-cashbook-client-transport";
const data = { today: "2026-10-05", page: 2, total: 21, canWrite: true, closedDates: [], canDrawer: true, balance: 0, balanceLabel: "關店實點現金", entries: [] };
beforeEach(() => { vi.resetAllMocks(); m.read.mockResolvedValue(data); });
afterEach(() => vi.unstubAllGlobals());
it("route delegates scoped authorization once and returns only JSON with no-store", async () => {
  const response = await GET(new Request("https://example.com/api/cashbook/quick?storeId=a&page=2"));
  expect(m.read).toHaveBeenCalledExactlyOnceWith("a", 2);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Content-Type")).toContain("application/json");
  expect(response.headers.get("Server-Timing")).toMatch(/^cashbook;dur=\d+$/);
  expect(await response.json()).toEqual({ storeId: "a", data });
});
it.each(["", "?storeId=a&page=0", "?storeId=a&page=1.5", "?storeId=a&page=NaN", "?storeId=a&page=100001"])("invalid query %s does not start data queries", async query => {
  expect((await GET(new Request("https://example.com/api/cashbook/quick" + query))).status).toBe(400);
  expect(m.read).not.toHaveBeenCalled();
});
it.each([["UNAUTHORIZED", 401], ["FORBIDDEN", 403]] as const)("preserves %s denial without exposing data", async (code, status) => {
  m.read.mockRejectedValue(new AppError(code, "private error"));
  const response = await GET(new Request("https://example.com/api/cashbook/quick?storeId=a&page=2"));
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(JSON.stringify(await response.json())).not.toContain("private error");
});
it("query failures do not return a stale success or internal error", async () => {
  m.read.mockRejectedValue(new Error("DB password must stay private"));
  const response = await GET(new Request("https://example.com/api/cashbook/quick?storeId=a"));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("DB password");
});
it("client uses scoped no-store GET and accepts zero balance", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ storeId: "a", data }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await readQuickCashbook("a", 2)).toEqual(data);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/cashbook/quick?storeId=a&page=2", { cache: "no-store", credentials: "same-origin" });
});
it.each([
  { storeId: "b", data },
  { storeId: "a", data: { ...data, page: 1 } },
  { storeId: "a", data: { ...data, canWrite: undefined } },
  { storeId: "a", data: { ...data, entries: null } },
  { success: false, error: "denied" },
])( "client rejects wrong scope/page and malformed payloads", async payload => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
  await expect(readQuickCashbook("a", 2)).rejects.toThrow("收支資料不符");
});
it("client retries the network after failure instead of reusing a failed result", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 503 })).mockResolvedValueOnce(Response.json({ storeId: "a", data }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(readQuickCashbook("a", 2)).rejects.toThrow("暫時無法讀取");
  expect(await readQuickCashbook("a", 2)).toEqual(data);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
