import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitMusicSourceImport } from "@/server/actions/music-source-import";
import { uploadVerifiedMusicOpening } from "@/server/actions/music-opening-import";
import { sourceFixture } from "./fixtures/music-source-import";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), preview: vi.fn(), commit: vi.fn(), read: vi.fn() }));
vi.mock("@/server/services/music-source-import", () => ({ authorizeMusicSourceImport: mocks.authorize, previewMusicSourceImport: mocks.preview, commitMusicSourceImport: mocks.commit, readMusicSourceBatch: mocks.read }));
const initial = { status: "IDLE" as const, message: "" };
function form(intent = "preview") {
  const f = new FormData(); f.set("manifest", new Blob([JSON.stringify(sourceFixture())]), "source.json");
  f.set("fileVersion", "1"); f.set("intent", intent); return f;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.authorize.mockResolvedValue({});
  mocks.preview.mockResolvedValue({ contentHash: "a".repeat(64), planHash: "b".repeat(64), preview: { counts: { students: 1 }, create: 1, review: 0 } });
  mocks.commit.mockResolvedValue({ batchId: "synthetic", duplicate: false });
});
describe("two-stage import actions", () => {
  it("authenticates before reading uploaded content", async () => {
    mocks.authorize.mockRejectedValue(new Error("private")); const f = form();
    const read = vi.spyOn(f.get("manifest") as File, "text");
    expect((await submitMusicSourceImport(initial, f)).status).toBe("HOLD"); expect(read).not.toHaveBeenCalled();
  });
  it("preview never calls commit", async () => {
    expect((await submitMusicSourceImport(initial, form())).status).toBe("PREVIEW"); expect(mocks.commit).not.toHaveBeenCalled();
  });
  it("requires confirmation, same file hash and fresh preview hash", async () => {
    const f = form("commit"); expect((await submitMusicSourceImport(initial, f)).status).toBe("HOLD");
    f.set("confirmed", "yes"); f.set("contentHash", "a".repeat(64)); f.set("planHash", "stale");
    expect((await submitMusicSourceImport(initial, f)).status).toBe("HOLD"); expect(mocks.commit).not.toHaveBeenCalled();
    f.set("planHash", "b".repeat(64)); expect((await submitMusicSourceImport(initial, f)).status).toBe("IMPORTED");
  });
  it("unknown commit outcome returns a stable recovery batch and does not retry", async () => {
    const f = form("commit"); f.set("confirmed", "yes"); f.set("contentHash", "a".repeat(64)); f.set("planHash", "b".repeat(64));
    mocks.commit.mockRejectedValue(new Error("lost private connection"));
    const result = await submitMusicSourceImport(initial, f);
    expect(result.status).toBe("RECONCILE"); expect(result.batchId).toHaveLength(36); expect(result.message).not.toContain("private"); expect(mocks.commit).toHaveBeenCalledOnce();
  });
  it("old action cannot read a file or write entitlements even when authorized", async () => {
    const f = form(); const read = vi.spyOn(f.get("manifest") as File, "text");
    const result = await uploadVerifiedMusicOpening(initial, f);
    expect(result.status).toBe("HOLD"); expect(result.message).toContain("停用"); expect(read).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled();
  });
});
