import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { payloadSchema, sanitizeConsultationPayload } from "@/lib/consultation-lead";
import { planLegacyConsultationImport, runLegacyConsultationImport, sha256, type LegacyExisting, type LegacyInsert, type LegacyImportStore } from "@/lib/consultation-legacy-import";
import { legacyFixture } from "./fixtures/consultation-legacy";

function memoryStore(f = legacyFixture()) {
  let rows: LegacyExisting[] = [];
  const identity = vi.fn(async () => f.target), source = vi.fn(async () => f.source);
  const findByRequestIds = vi.fn(async (ids: readonly string[]) => rows.filter(row => ids.includes(row.requestId)));
  const insert = vi.fn(async (row: LegacyInsert) => { rows.push(row); });
  const store: LegacyImportStore = { identity, source, findByRequestIds,
    transaction: vi.fn(async work => {
      const before = structuredClone(rows);
      try { return await work({ identity, source, findByRequestIds, insert }); }
      catch (error) { rows = before; throw error; }
    }) };
  return { store, insert, identity, source, findByRequestIds, rows: () => rows, setRows: (value: LegacyExisting[]) => { rows = value; } };
}
const apply = { mode: "apply" as const, explicitApply: true, actorId: "synthetic-reviewer", now: () => new Date("2026-10-08T16:00:00.000Z") };
const input = (f: ReturnType<typeof legacyFixture>) => ({ manifestText: f.manifestText, snapshotText: f.snapshotText, approval: f.approval });
const plan = (f: ReturnType<typeof legacyFixture>, existing: LegacyExisting[] = []) => planLegacyConsultationImport({ ...input(f), actualTarget: f.target, source: f.source, existing });

describe("controlled legacy import contract, synthetic only", () => {
  it("defaults to 4 proposed inserts, no writes; excludes 13 tests and 14 formula mirrors", async () => {
    const f = legacyFixture(), m = memoryStore(f);
    expect(await runLegacyConsultationImport(m.store, input(f))).toEqual({ mode: "dry-run", inserted: 0, proposedInsert: 4, skipped: 0, conflicts: 0, phoneReviewCount: 2, excludedTests: 13, excludedMirrors: 14 });
    expect(m.store.transaction).not.toHaveBeenCalled(); expect(m.insert).not.toHaveBeenCalled();
    expect(m.findByRequestIds).toHaveBeenCalledWith(f.approval.requestIds);
  });
  it("requires explicit apply and actor, independently of the reviewed manifest", async () => {
    const f = legacyFixture(), m = memoryStore(f);
    await expect(runLegacyConsultationImport(m.store, input(f), { mode: "apply", actorId: "actor" })).rejects.toThrow("APPLY_NOT_APPROVED");
    await expect(runLegacyConsultationImport(m.store, input(f), { ...apply, actorId: " " })).rejects.toThrow("APPLY_NOT_APPROVED");
    expect(m.store.transaction).not.toHaveBeenCalled();
  });
  it("inserts only terminal historical rows, original UTC milliseconds and unaltered nine digits", async () => {
    const f = legacyFixture(), m = memoryStore(f);
    expect(await runLegacyConsultationImport(m.store, input(f), apply)).toMatchObject({ mode: "apply", inserted: 4, skipped: 0, conflicts: 0 });
    expect(m.rows()[0]).toMatchObject({ createdAt: "2026-03-02T23:17:53.984Z", phone: "900000001", status: "NEW", revision: 1,
      sheetStatus: "LEGACY_IMPORTED", sheetAttemptedAt: null, sheetConfirmedAt: null, trialApplicationId: null, trialLinkedAt: null, trialLinkedBy: null,
      legacyImport: { sourceCreatedAt: "2026-03-02T23:17:53.984Z", sourceTimezone: "Etc/GMT", phoneNeedsReview: true, importedAt: "2026-10-08T16:00:00.000Z", importedBy: "synthetic-reviewer" } });
    expect(m.source).toHaveBeenCalledTimes(2); expect(m.findByRequestIds).toHaveBeenCalledTimes(2);
  });
  it("replaying the exact batch skips all 4 without touching existing rows", async () => {
    const f = legacyFixture(), m = memoryStore(f);
    await runLegacyConsultationImport(m.store, input(f), apply); m.insert.mockClear();
    const before = structuredClone(m.rows());
    expect(await runLegacyConsultationImport(m.store, input(f), apply)).toMatchObject({ inserted: 0, skipped: 4 });
    expect(m.insert).not.toHaveBeenCalled(); expect(m.rows()).toEqual(before);
  });
  it.each(["hash", "source", "date", "live", "payload"])("same UUID with different %s blocks the entire batch", async kind => {
    const f = legacyFixture(), m = memoryStore(f); await runLegacyConsultationImport(m.store, input(f), apply);
    const one = structuredClone(m.rows()[0]);
    if (kind === "hash") one.payloadHash = "a".repeat(64);
    if (kind === "source") one.legacyImport!.spreadsheetId = "different-source";
    if (kind === "date") one.createdAt = "2026-03-03T00:00:00.000Z";
    if (kind === "live") { one.sheetStatus = "CONFIRMED"; one.legacyImport = null; }
    if (kind === "payload") one.originalPayload = {};
    m.setRows([one]); m.insert.mockClear();
    expect(plan(f, m.rows()).conflicts).toEqual([one.requestId]);
    await expect(runLegacyConsultationImport(m.store, input(f), apply)).rejects.toThrow("DESTINATION_CONFLICT");
    expect(m.insert).not.toHaveBeenCalled(); expect(m.rows()).toEqual([one]);
  });
  it("a partial insertion failure rolls the transaction back", async () => {
    const f = legacyFixture(), m = memoryStore(f);
    m.insert.mockImplementationOnce(async row => { m.setRows([row]); }).mockRejectedValueOnce(new Error("synthetic failure"));
    await expect(runLegacyConsultationImport(m.store, input(f), apply)).rejects.toThrow("synthetic failure"); expect(m.rows()).toEqual([]);
  });
  it("stale manifest is rejected before opening the read adapter", async () => {
    const f = legacyFixture(), m = memoryStore(f);
    await expect(runLegacyConsultationImport(m.store, { ...input(f), manifestText: f.manifestText + " " })).rejects.toThrow("STALE_MANIFEST");
    expect(m.identity).not.toHaveBeenCalled();
    await expect(runLegacyConsultationImport(m.store, { ...input(f), snapshotText: "changed" })).rejects.toThrow("STALE_SNAPSHOT");
  });
  it("rejects a reviewed payload that would change under opt-out sanitization", () => {
    const f = legacyFixture();
    const row = f.rows[0];
    const canonical = payloadSchema.parse({ ...row.canonicalHqPayload, phone: "", contactName: "Synthetic retained contact",
      lineId: "synthetic-retained-line", formVersion: "fitness-v2", source: "fitness-intake", contactWay: "目前暫不考慮",
      priorityNeed: "合成需求" });
    row.canonicalHqPayload = canonical;
    row.canonicalHqPayloadHash = sha256(JSON.stringify(sanitizeConsultationPayload(canonical)));
    row.phoneImport = { observedText: "", normalizedText: "", altered: false };
    f.manifestText = JSON.stringify(f.manifest); f.approval.manifestSha256 = sha256(f.manifestText);
    expect(() => plan(f)).toThrow("PAYLOAD_MISMATCH");
  });
  it.each(["hash", "notes", "serial", "timezone", "uuid", "row"])("refreshed source change (%s) is rejected", kind => {
    const f = legacyFixture();
    if (kind === "hash") f.source.rows[0].formattedValues[1] += "changed";
    if (kind === "notes") f.source.rows[0].cellNotes.push("new note");
    if (kind === "serial") f.source.rows[0].dateSerial += 0.001;
    if (kind === "timezone") f.source.timezone = "Asia/Taipei";
    if (kind === "uuid") f.source.rows[0].formattedValues[27] = f.source.rows[1].formattedValues[27];
    if (kind === "row") f.source.rows[0].sourceRow++;
    expect(() => plan(f)).toThrow(/SOURCE_/);
  });
  it("a source change between insertion and verification rolls back", async () => {
    const f = legacyFixture(), m = memoryStore(f);
    m.source.mockResolvedValueOnce(structuredClone(f.source)).mockImplementation(async () => ({ ...f.source, timezone: "changed" }));
    await expect(runLegacyConsultationImport(m.store, input(f), apply)).rejects.toThrow("SOURCE_IDENTITY_MISMATCH"); expect(m.rows()).toEqual([]);
  });
  it("refuses wrong target, unknown classification, duplicate IDs and phone repair", () => {
    const f = legacyFixture();
    expect(() => planLegacyConsultationImport({ ...input(f), actualTarget: { ...f.target, projectId: "wrong" }, source: f.source, existing: [] })).toThrow("TARGET_MISMATCH");
    f.manifest.rows[0].classification = "unreviewed";
    f.manifestText = JSON.stringify(f.manifest); f.approval.manifestSha256 = sha256(f.manifestText);
    expect(() => plan(f)).toThrow("UNKNOWN_CLASSIFICATION");
    const duplicate = legacyFixture(); duplicate.approval.requestIds[0] = duplicate.approval.requestIds[1];
    expect(() => plan(duplicate)).toThrow("CANDIDATE_SET_MISMATCH");
    const p = legacyFixture(); p.rows[0].phoneImport.normalizedText = "0900000001"; p.manifestText = JSON.stringify(p.manifest); p.approval.manifestSha256 = sha256(p.manifestText);
    expect(() => plan(p)).toThrow("PHONE_CHANGED");
  });
  it("never imports notification services, creates TrialApplication or instantiates a production client", () => {
    const code = readFileSync("src/lib/consultation-legacy-import.ts", "utf8");
    expect(code).not.toMatch(/from ["'].*(?:db|intake|notification|trial-application)/);
    expect(code).not.toMatch(/new PrismaClient|fetch\(|\.upsert\(/);
  });
});
