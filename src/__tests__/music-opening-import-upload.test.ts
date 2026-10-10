import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadVerifiedMusicOpening } from "@/server/actions/music-opening-import";
import { AppError } from "@/lib/errors";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), apply: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/server/services/music-opening-import", () => ({ authorizeMusicOpeningImport: mocks.authorize, importVerifiedMusicOpening: mocks.apply }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const initial = { status: "IDLE" as const, message: "" };
const data = { synthetic: true };
const proof = { sourceManifestKey: "synthetic", sourceRevision: "r1", contentHash: "a".repeat(64), now: "2026-10-10T16:00:00Z", maxAgeMs: 60_000 };
function form(value: unknown = { data, proof }) {
  const input = new FormData(); input.set("manifest", new Blob([typeof value === "string" ? value : JSON.stringify(value)]), "synthetic.json"); return input;
}
beforeEach(() => { vi.clearAllMocks(); mocks.authorize.mockResolvedValue({}); mocks.apply.mockResolvedValue({ status: "IMPORTED", created: 1, skipped: 0, cardIds: ["private-card-id"], makeup: { created: 2, skipped: 0, entitlementIds: ["private-right-id"] } }); });
afterEach(() => vi.restoreAllMocks());
describe("verified opening upload", () => {
  it("denies scope/access before reading the file", async () => {
    mocks.authorize.mockRejectedValue(new Error("private connection"));
    const input = form(), read = vi.spyOn(input.get("manifest") as File, "text");
    expect(await uploadVerifiedMusicOpening(initial, input)).toMatchObject({ status: "HOLD" });
    expect(read).not.toHaveBeenCalled(); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it.each(["broken JSON", { data }, { data, proof, extra: true }])("malformed envelope never reaches importer", async value => {
    expect(await uploadVerifiedMusicOpening(initial, form(value))).toMatchObject({ status: "HOLD" }); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("rejects oversized data without an import", async () => {
    expect(await uploadVerifiedMusicOpening(initial, form("x".repeat(512_001)))).toMatchObject({ status: "HOLD" }); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("never treats nullable target schema as unlimited Luby validity", async () => {
    const input = form({ data: { enrollments: [{ record: { expiryVerification: { kind: "NO_EXPIRY" } } }] }, proof });
    const result = await uploadVerifiedMusicOpening(initial, input);
    expect(result).toMatchObject({ status: "HOLD" }); expect(result.message).toContain("都有期限"); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("also holds unlimited makeup rights for Luby", async () => {
    const input = form({ data: { makeup: { records: [{ expiry: { verification: "VERIFIED", value: null } }] } }, proof });
    expect(await uploadVerifiedMusicOpening(initial, input)).toMatchObject({ status: "HOLD" }); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("passes independent proof unchanged and returns only readback counts", async () => {
    const result = await uploadVerifiedMusicOpening(initial, form());
    expect(mocks.apply).toHaveBeenCalledWith(data, proof); expect(result.status).toBe("IMPORTED");
    expect(result.message).toContain("新增方案 1 筆、補課權益 2 筆"); expect(JSON.stringify(result)).not.toContain("private-");
    expect(mocks.revalidate).toHaveBeenCalledTimes(2);
  });
  it("held source data is not reported as imported", async () => {
    mocks.apply.mockResolvedValue({ status: "HOLD", issue: "SOURCE_DATE_UNVERIFIED" });
    expect(await uploadVerifiedMusicOpening(initial, form())).toMatchObject({ status: "HOLD" }); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("known transaction rejection never leaks source data", async () => {
    mocks.apply.mockRejectedValue(new AppError("CONFLICT", "private-source-id"));
    const result = await uploadVerifiedMusicOpening(initial, form()); expect(result.status).toBe("HOLD"); expect(result.message).not.toContain("private-source-id");
  });
  it("unknown commit error requires reconciliation and never retries", async () => {
    mocks.apply.mockRejectedValue(new Error("connection lost: private-data"));
    expect(await uploadVerifiedMusicOpening(initial, form())).toMatchObject({ status: "RECONCILE" }); expect(mocks.apply).toHaveBeenCalledOnce();
  });
  it("post-commit cache failure also requires readback rather than claiming rollback", async () => {
    mocks.revalidate.mockImplementation(() => { throw new Error("cache unavailable"); });
    expect(await uploadVerifiedMusicOpening(initial, form())).toMatchObject({ status: "RECONCILE" }); expect(mocks.apply).toHaveBeenCalledOnce();
  });
});
