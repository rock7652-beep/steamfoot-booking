import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ authorize: vi.fn(), preview: vi.fn(), commit: vi.fn(), read: vi.fn() }));
vi.mock("@/server/services/music-source-import", () => ({ authorizeMusicSourceImport: m.authorize, previewMusicSourceImport: m.preview, commitMusicSourceImport: m.commit, readMusicSourceBatch: m.read }));
import { submitMusicSourceImport, exportMusicSourceBatch } from "@/server/actions/music-source-import";
import { uploadVerifiedMusicOpening } from "@/server/actions/music-opening-import";
const initial = { status: "IDLE" as const, message: "" };
beforeEach(() => vi.clearAllMocks());
it.each(["preview", "commit"])("retired %s cannot read an upload or access the importer", async intent => {
  const form = new FormData();
  form.set("manifest", new Blob(['{}']), "history.json");
  form.set("intent", intent); form.set("confirmed", "yes");
  const read = vi.spyOn(form.get("manifest") as File, "text");
  expect(await submitMusicSourceImport(initial, form)).toMatchObject({ status: "HOLD", message: expect.stringContaining("已移除") });
  expect(read).not.toHaveBeenCalled();
  for (const query of Object.values(m)) expect(query).not.toHaveBeenCalled();
});
it("retired export cannot read historical batches", async () => {
  expect(await exportMusicSourceBatch("old-batch")).toMatchObject({ success: false });
  expect(m.read).not.toHaveBeenCalled();
});
it("old upload action returns a retirement message without reading files", async () => {
  const form = new FormData(); form.set("manifest", new Blob(['{}']), "history.json");
  const read = vi.spyOn(form.get("manifest") as File, "text");
  expect(await uploadVerifiedMusicOpening(initial, form)).toMatchObject({ status: "HOLD", message: expect.stringContaining("已移除") });
  expect(read).not.toHaveBeenCalled(); expect(m.authorize).not.toHaveBeenCalled(); expect(m.commit).not.toHaveBeenCalled();
});
