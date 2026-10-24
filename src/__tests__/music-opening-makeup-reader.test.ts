import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ transaction: vi.fn(), rights: vi.fn(), native: vi.fn(), sessions: vi.fn(), raw: vi.fn() }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { $transaction: m.transaction } }));
import { getOpeningMakeupWorkspace } from "@/server/queries/music-opening-makeup";
import {
  classifyMusicOpeningMakeupRecord, musicOpeningMakeupContentHash,
  musicOpeningMakeupSourceKey, musicOpeningMakeupSourceSlotKey,
  type MusicOpeningMakeupRecord, type MusicOpeningMakeupReceipt,
} from "@/lib/music-opening-makeup";
import { makeupRecord } from "./fixtures/music-opening-makeup";
const storeId = "synthetic-store", customerId = "synthetic-student", templateId = "synthetic-template";
let receipts: MusicOpeningMakeupReceipt[];
let attendance: { targetId: string; afterJson: { action: string; actualAttendance: boolean; result: { bookingId: string; status: string; version: number } } }[];
const tx = { courseMusicOpeningMakeupEntitlement: { findMany: m.rights }, courseBooking: { findMany: m.native }, courseSession: { findMany: m.sessions }, $queryRaw: m.raw };
function receipt(snapshot: MusicOpeningMakeupRecord): MusicOpeningMakeupReceipt {
  return { kind: classifyMusicOpeningMakeupRecord(snapshot), snapshot,
    sourceKey: musicOpeningMakeupSourceKey(snapshot), sourceSlotKey: musicOpeningMakeupSourceSlotKey(snapshot),
    contentHash: musicOpeningMakeupContentHash(snapshot) };
}
function nativeSource() {
  const snapshot = makeupRecord({ sourceEnrollmentKey: "private-native-enrollment", sourceLessonKey: "private-native-source-lesson",
    sourceDate: { value: "2026-10-02", verification: "VERIFIED" }, balanceTreatment: "NATIVE_CARD_VERIFIED" });
  snapshot.nativeSourceBooking = { id: "native-source", storeId, customerId, templateId, cardId: "private-native-card",
    sourceLessonKey: snapshot.sourceLessonKey, unit: "SESSION", status: "CANCELLED", absenceKind: "STUDENT_LEAVE", activeMakeupBookingId: null };
  return snapshot;
}
const nativeRoot = () => ({ id: "native-source", cardId: "private-native-card", makeupForBookingId: null, status: "CANCELLED", absenceKind: "STUDENT_LEAVE", session: { startsAt: new Date("2026-10-02T02:00:00Z") } });
function right(status = "RESERVED") {
  const snapshot = makeupRecord(), source = receipt(snapshot);
  return { id: "right", storeId, customerId, templateId, version: 3, snapshot,
    sourceKey: source.sourceKey, sourceSlotKey: source.sourceSlotKey, contentHash: source.contentHash,
    bookings: [{ id: "opening-booking", storeId, customerId, bookingKind: "OPENING_MAKEUP", cardId: null,
      pointCost: 0, makeupForBookingId: null, musicOpeningMakeupEntitlementId: "right", status,
      checkedInAt: new Date("2026-10-07T02:00:00Z"), sessionId: "session",
      session: { storeId, templateId, startsAt: new Date("2026-10-07T02:00:00Z"), nameSnapshot: "Synthetic lesson" } }] };
}
function attendanceReceipt(version = 3) {
  return { targetId: "right", afterJson: { action: "ATTEND", actualAttendance: true,
    result: { bookingId: "opening-booking", status: "ATTENDED", version } } };
}
beforeEach(() => {
  vi.resetAllMocks(); receipts = []; attendance = [];
  m.transaction.mockImplementation(async work => work(tx));
  m.rights.mockResolvedValue([]); m.native.mockResolvedValue([]); m.sessions.mockResolvedValue([]);
  m.raw.mockImplementation(async (strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes("OPENING_MAKEUP_DISPOSITION")) return receipts.map(item => ({ afterJson: { receipt: item } }));
    if (sql.includes("OPENING_MAKEUP_OPERATION")) return attendance;
    if (sql.includes('FROM "Customer"')) return [{ id: customerId, name: "Synthetic learner" }];
    throw new Error(`Unexpected query: ${sql}`);
  });
});
describe("unified reader uses verified native-only manifest coverage", () => {
  it("counts a native-only leave when there are zero opening entitlement rows", async () => {
    receipts = [receipt(nativeSource())]; m.native.mockResolvedValue([nativeRoot()]);
    const result = await getOpeningMakeupWorkspace(storeId);
    expect(result).toMatchObject({ opening: { issued: 0, outstanding: 0 }, native: { issued: 1, outstanding: 1, reserved: 0, unreserved: 1 }, totalOutstanding: 1, verifiedCustomerCount: 1, rows: [] });
    expect(m.native).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId, customerId, bookingKind: "CARD", musicOpeningMakeupEntitlementId: null, session: expect.objectContaining({ templateId }) }) }));
    expect(m.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead", timeout: 15000 });
  });
  it.each(["RESERVED", "ATTENDED"])("a native %s attempt remains in the same original chain", async status => {
    receipts = [receipt(nativeSource())];
    m.native.mockResolvedValue([nativeRoot(), { ...nativeRoot(), id: "attempt", makeupForBookingId: "native-source", status, absenceKind: null, session: { startsAt: new Date("2026-10-03T02:00:00Z") } }]);
    const result = await getOpeningMakeupWorkspace(storeId);
    expect(result.native).toMatchObject(status === "RESERVED" ? { issued: 1, reserved: 1, outstanding: 1, unreserved: 0 } : { issued: 1, redeemed: 1, reserved: 0, outstanding: 0, unreserved: 0 });
  });
  it("deduplicates matching opening and native receipt scopes before counting a chain", async () => {
    const opening = right(); m.rights.mockResolvedValue([opening]);
    receipts = [receipt(opening.snapshot), receipt(nativeSource())]; m.native.mockResolvedValue([nativeRoot()]);
    const result = await getOpeningMakeupWorkspace(storeId);
    expect(m.native).toHaveBeenCalledTimes(1); expect(result.totalOutstanding).toBe(2);
  });
  it("does not bring another customer's native receipt into a customer-filtered workspace", async () => {
    receipts = [receipt(nativeSource())];
    const result = await getOpeningMakeupWorkspace(storeId, "different-customer");
    expect(m.native).not.toHaveBeenCalled(); expect(result.verifiedCustomerCount).toBe(0);
  });
});
describe("reader fails closed on damaged links and unsupported states", () => {
  it.each(["customer", "template", "booking-store", "session-store", "kind", "card", "point-cost", "entitlement-link", "native-link"])("rejects corrupted linked %s before reporting counts", async field => {
    const row = right(), booking = row.bookings[0];
    if (field === "customer") booking.customerId = "foreign-customer";
    if (field === "template") booking.session.templateId = "foreign-template";
    if (field === "booking-store") booking.storeId = "foreign-store";
    if (field === "session-store") booking.session.storeId = "foreign-store";
    if (field === "kind") booking.bookingKind = "TRIAL";
    if (field === "card") Object.assign(booking, { cardId: "paid-card" });
    if (field === "point-cost") booking.pointCost = 1;
    if (field === "entitlement-link") booking.musicOpeningMakeupEntitlementId = "other-right";
    if (field === "native-link") Object.assign(booking, { makeupForBookingId: "native-source" });
    m.rights.mockResolvedValue([row]); receipts = [receipt(row.snapshot)];
    await expect(getOpeningMakeupWorkspace(storeId)).rejects.toThrow("權益關聯不一致");
    expect(m.native).not.toHaveBeenCalled();
  });
  it("rejects malformed receipt identity instead of dropping its native coverage", async () => {
    receipts = [{ ...receipt(nativeSource()), contentHash: "f".repeat(64) }];
    await expect(getOpeningMakeupWorkspace(storeId)).rejects.toThrow("核對紀錄不完整");
    expect(m.native).not.toHaveBeenCalled();
  });
  it("keeps check-in outstanding without manufacturing actual attendance", async () => {
    m.rights.mockResolvedValue([right()]); receipts = [receipt(makeupRecord())];
    const result = await getOpeningMakeupWorkspace(storeId);
    expect(result.opening).toMatchObject({ outstanding: 1, reserved: 1, redeemed: 0 });
    expect(result.rows[0].booking?.checkedIn).toBe(true);
  });
  it.each(["missing", "wrong-version", "wrong-booking", "unchecked", "wrong-action"])("requires exact actual-attendance evidence: %s", async mode => {
    m.rights.mockResolvedValue([right("ATTENDED")]); receipts = [receipt(makeupRecord())];
    if (mode !== "missing") {
      const evidence = attendanceReceipt();
      if (mode === "wrong-version") evidence.afterJson.result.version = 2;
      if (mode === "wrong-booking") evidence.afterJson.result.bookingId = "other-booking";
      if (mode === "unchecked") evidence.afterJson.actualAttendance = false;
      if (mode === "wrong-action") evidence.afterJson.action = "CHECK_IN";
      attendance = [evidence];
    }
    await expect(getOpeningMakeupWorkspace(storeId)).rejects.toThrow("實際出席核對紀錄");
  });
  it("counts redemption only with matching actual attendance at the current version", async () => {
    m.rights.mockResolvedValue([right("ATTENDED")]); receipts = [receipt(makeupRecord())]; attendance = [attendanceReceipt()];
    expect((await getOpeningMakeupWorkspace(storeId)).opening).toEqual({ issued: 1, outstanding: 0, reserved: 0, redeemed: 1, unreserved: 0 });
  });
  it("returns display fields but never serializes upstream identities or native card IDs", async () => {
    m.rights.mockResolvedValue([right()]); receipts = [receipt(makeupRecord()), receipt(nativeSource())]; m.native.mockResolvedValue([nativeRoot()]);
    const serialized = JSON.stringify(await getOpeningMakeupWorkspace(storeId));
    for (const hidden of ["sourceKey", "sourceSlotKey", "contentHash", "sourceStudentKey", "sourceEnrollmentKey", "sourceLessonKey", "sourceTermKey", "nativeSourceBooking", "musicOpeningMakeupEntitlementId", "synthetic-tenant", "original-9-3", "private-native-source-lesson", "private-native-card"]) expect(serialized).not.toContain(hidden);
    expect(serialized).toContain("Synthetic learner"); expect(serialized).toContain("原第 9 期第 3 堂");
  });
});

describe("reader reconciles every promised source with its persisted entity", () => {
  it("blocks an OPENING receipt whose entitlement row is missing rather than reporting zero", async () => {
    receipts = [receipt(makeupRecord())];
    await expect(getOpeningMakeupWorkspace(storeId)).rejects.toThrow("已核對的期初權益缺少資料");
    expect(m.native).not.toHaveBeenCalled();
  });
  it("blocks an entitlement with no immutable source receipt", async () => {
    m.rights.mockResolvedValue([right()]);
    await expect(getOpeningMakeupWorkspace(storeId)).rejects.toThrow("期初權益缺少完整來源核對紀錄");
    expect(m.native).not.toHaveBeenCalled();
  });
  it("blocks a native receipt whose mapped source is missing rather than reporting zero", async () => {
    receipts = [receipt(nativeSource())];
    await expect(getOpeningMakeupWorkspace(storeId)).rejects.toThrow("切點後來源原預約缺少資料或映射變更");
  });
  it.each(["card", "date", "native-link", "original-id"])("blocks a mapped native source with moved %s", async field => {
    receipts = [receipt(nativeSource())]; const original = nativeRoot();
    if (field === "card") original.cardId = "different-card";
    if (field === "date") original.session.startsAt = new Date("2026-10-03T02:00:00Z");
    if (field === "native-link") Object.assign(original, { makeupForBookingId: "another-source" });
    if (field === "original-id") original.id = "different-original";
    m.native.mockResolvedValue([original]);
    await expect(getOpeningMakeupWorkspace(storeId)).rejects.toThrow("切點後來源原預約缺少資料或映射變更");
  });
  it("allows a restored original later corrected to ATTENDED to remove the native leave liability", async () => {
    receipts = [receipt(nativeSource())];
    m.native.mockResolvedValue([{ ...nativeRoot(), status: "ATTENDED", absenceKind: null }]);
    const result = await getOpeningMakeupWorkspace(storeId);
    expect(result.native).toEqual({ issued: 0, redeemed: 0, reserved: 0, outstanding: 0, unreserved: 0 });
    expect(result.totalOutstanding).toBe(0); expect(result.verifiedCustomerCount).toBe(1);
  });
  it("compares the mapped native source on its Taipei business date", async () => {
    receipts = [receipt(nativeSource())];
    m.native.mockResolvedValue([{ ...nativeRoot(), session: { startsAt: new Date("2026-10-01T16:30:00Z") } }]);
    expect((await getOpeningMakeupWorkspace(storeId)).native.outstanding).toBe(1);
  });
});
