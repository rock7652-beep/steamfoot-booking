import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/line-config", () => ({ getLineAccessTokenForStore: () => "test-token", getSteamButlerLineAccessToken: () => "central-test-token" }));
vi.mock("@/lib/runtime-env", () => ({ isPreviewExternalIntegrationBlocked: () => false }));
import { pushMessage, pushSteamButlerMessage } from "@/lib/line";
const fetchMock = vi.fn();
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });
it("sends a stable LINE retry key and treats an accepted duplicate as success", async () => {
  fetchMock.mockResolvedValue(new Response("{}", { status: 409, headers: { "x-line-accepted-request-id": "already-accepted" } }));
  expect(await pushMessage("store", "recipient", [{ type: "text", text: "hello" }], "uuid")).toEqual({ success: true });
  expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: expect.objectContaining({ "X-Line-Retry-Key": "uuid" }) }));
});
it("does not interpret unrelated 409 errors as successful delivery", async () => {
  fetchMock.mockResolvedValue(new Response("{}", { status: 409 }));
  expect(await pushMessage("store", "recipient", [{ type: "text", text: "hello" }], "uuid")).toMatchObject({ success: false });
});
it("preserves callers that do not supply a retry key", async () => {
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  expect(await pushMessage("store", "recipient", [{ type: "text", text: "hello" }])).toEqual({ success: true });
  expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("X-Line-Retry-Key");
});

it("central delivery preserves the retry key and handles accepted duplicates", async () => {
  fetchMock.mockResolvedValue(new Response("{}", { status: 409, headers: { "x-line-accepted-request-id": "accepted" } }));
  expect(await pushSteamButlerMessage("recipient", [{type:"text",text:"hello"}], "central-key")).toEqual({success:true});
  expect(fetchMock.mock.calls[0][1].headers).toMatchObject({"X-Line-Retry-Key":"central-key",Authorization:"Bearer central-test-token"});
});
