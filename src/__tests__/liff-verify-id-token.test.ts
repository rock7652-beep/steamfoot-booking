/**
 * src/lib/liff/verify-id-token.ts 行為測試。
 *
 * 用 vi.stubGlobal("fetch", ...) 模擬 LINE verify 端點各種回應。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LiffIdTokenError,
  verifyLiffIdToken,
} from "@/lib/liff/verify-id-token";

const CHANNEL = "1234567890";
const VALID_SUB = "U_line_user_id_abc";

function makeOkResponse(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeErrorResponse(
  status: number,
  body: Record<string, unknown> | string
): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("verifyLiffIdToken", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const futureExp = () => Math.floor(Date.now() / 1000) + 3600;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("input validation", () => {
    it("rejects empty idToken with MISSING_INPUT", async () => {
      const e = await verifyLiffIdToken("", CHANNEL).catch((err) => err);
      expect(e).toBeInstanceOf(LiffIdTokenError);
      expect((e as LiffIdTokenError).code).toBe("MISSING_INPUT");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects null idToken with MISSING_INPUT", async () => {
      const e = await verifyLiffIdToken(null, CHANNEL).catch((err) => err);
      expect((e as LiffIdTokenError).code).toBe("MISSING_INPUT");
    });

    it("rejects empty expectedChannelId with MISSING_INPUT", async () => {
      const e = await verifyLiffIdToken("token", "").catch((err) => err);
      expect((e as LiffIdTokenError).code).toBe("MISSING_INPUT");
    });
  });

  describe("happy path", () => {
    it("returns verified payload on 200", async () => {
      fetchMock.mockResolvedValueOnce(
        makeOkResponse({
          iss: "https://access.line.me",
          sub: VALID_SUB,
          aud: CHANNEL,
          exp: futureExp(),
          name: "Test User",
          picture: "https://line.me/avatar.png",
        })
      );
      const verified = await verifyLiffIdToken("a-valid-token", CHANNEL);
      expect(verified.lineUserId).toBe(VALID_SUB);
      expect(verified.channelId).toBe(CHANNEL);
      expect(verified.displayName).toBe("Test User");
      expect(verified.pictureUrl).toBe("https://line.me/avatar.png");
    });

    it("posts form-encoded body to LINE verify endpoint", async () => {
      fetchMock.mockResolvedValueOnce(
        makeOkResponse({
          iss: "https://access.line.me",
          sub: VALID_SUB,
          aud: CHANNEL,
          exp: futureExp(),
        })
      );
      await verifyLiffIdToken("a-valid-token", CHANNEL);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.line.me/oauth2/v2.1/verify");
      expect(init.method).toBe("POST");
      expect(init.headers["Content-Type"]).toBe(
        "application/x-www-form-urlencoded"
      );
      expect(init.body).toContain("id_token=a-valid-token");
      expect(init.body).toContain(`client_id=${CHANNEL}`);
    });

    it("accepts aud as array containing channelId", async () => {
      fetchMock.mockResolvedValueOnce(
        makeOkResponse({
          iss: "https://access.line.me",
          sub: VALID_SUB,
          aud: [CHANNEL, "other-channel"],
          exp: futureExp(),
        })
      );
      const verified = await verifyLiffIdToken("token", CHANNEL);
      expect(verified.lineUserId).toBe(VALID_SUB);
    });

    it("returns null displayName/pictureUrl when LINE payload omits them", async () => {
      fetchMock.mockResolvedValueOnce(
        makeOkResponse({
          iss: "https://access.line.me",
          sub: VALID_SUB,
          aud: CHANNEL,
          exp: futureExp(),
        })
      );
      const verified = await verifyLiffIdToken("token", CHANNEL);
      expect(verified.displayName).toBeNull();
      expect(verified.pictureUrl).toBeNull();
    });
  });

  describe("LINE verify endpoint errors", () => {
    it("classifies 'IdToken expired' as EXPIRED", async () => {
      fetchMock.mockResolvedValueOnce(
        makeErrorResponse(400, { error: "invalid_request", error_description: "IdToken expired." })
      );
      const e = await verifyLiffIdToken("expired", CHANNEL).catch((err) => err);
      expect((e as LiffIdTokenError).code).toBe("EXPIRED");
    });

    it("classifies generic 400 as INVALID", async () => {
      fetchMock.mockResolvedValueOnce(
        makeErrorResponse(400, { error: "invalid_request", error_description: "bad signature" })
      );
      const e = await verifyLiffIdToken("bad", CHANNEL).catch((err) => err);
      expect((e as LiffIdTokenError).code).toBe("INVALID");
    });

    it("classifies non-JSON response as INVALID", async () => {
      fetchMock.mockResolvedValueOnce(makeErrorResponse(500, "<html>500</html>"));
      const e = await verifyLiffIdToken("token", CHANNEL).catch((err) => err);
      expect((e as LiffIdTokenError).code).toBe("INVALID");
    });

    it("classifies fetch throw as NETWORK", async () => {
      fetchMock.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND"));
      const e = await verifyLiffIdToken("token", CHANNEL).catch((err) => err);
      expect((e as LiffIdTokenError).code).toBe("NETWORK");
    });

    it("returns INVALID when 200 body is not JSON", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("not-json", { status: 200, headers: { "Content-Type": "text/plain" } })
      );
      const e = await verifyLiffIdToken("token", CHANNEL).catch((err) => err);
      expect((e as LiffIdTokenError).code).toBe("INVALID");
    });
  });

  describe("local defense-in-depth checks", () => {
    it("rejects wrong issuer with ISS_MISMATCH", async () => {
      fetchMock.mockResolvedValueOnce(
        makeOkResponse({
          iss: "https://evil.example.com",
          sub: VALID_SUB,
          aud: CHANNEL,
          exp: futureExp(),
        })
      );
      const e = await verifyLiffIdToken("token", CHANNEL).catch((err) => err);
      expect((e as LiffIdTokenError).code).toBe("ISS_MISMATCH");
    });

    it("rejects aud not matching expected channel", async () => {
      fetchMock.mockResolvedValueOnce(
        makeOkResponse({
          iss: "https://access.line.me",
          sub: VALID_SUB,
          aud: "different-channel",
          exp: futureExp(),
        })
      );
      const e = await verifyLiffIdToken("token", CHANNEL).catch((err) => err);
      expect((e as LiffIdTokenError).code).toBe("AUD_MISMATCH");
    });

    it("rejects expired exp even if LINE returned 200", async () => {
      fetchMock.mockResolvedValueOnce(
        makeOkResponse({
          iss: "https://access.line.me",
          sub: VALID_SUB,
          aud: CHANNEL,
          exp: 1, // 1970-01-01
        })
      );
      const e = await verifyLiffIdToken("token", CHANNEL).catch((err) => err);
      expect((e as LiffIdTokenError).code).toBe("EXPIRED");
    });

    it("rejects payload missing sub with INVALID", async () => {
      fetchMock.mockResolvedValueOnce(
        makeOkResponse({
          iss: "https://access.line.me",
          aud: CHANNEL,
          exp: futureExp(),
        })
      );
      const e = await verifyLiffIdToken("token", CHANNEL).catch((err) => err);
      expect((e as LiffIdTokenError).code).toBe("INVALID");
    });
  });
});
