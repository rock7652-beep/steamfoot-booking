import { describe, expect, it } from "vitest";
import { summarizeNativeMakeupSources } from "@/lib/music-opening-native-summary";
const root = { id: "native-source", makeupForBookingId: null, status: "CANCELLED", absenceKind: "STUDENT_LEAVE" };
const attempt = { id: "makeup", makeupForBookingId: root.id, status: "RESERVED", absenceKind: null };
describe("opening + native counts remain disjoint", () => {
  it("keeps an unheld actual native leave outstanding", () => expect(summarizeNativeMakeupSources([root], [root.id])).toMatchObject({ outstanding: 1, reserved: 0, unreserved: 1 }));
  it("does not subtract a reserved right from outstanding", () => expect(summarizeNativeMakeupSources([root, attempt], [root.id])).toMatchObject({ outstanding: 1, reserved: 1, unreserved: 0 }));
  it("only actual attendance removes the right", () => expect(summarizeNativeMakeupSources([root, { ...attempt, status: "ATTENDED" }], [root.id])).toMatchObject({ outstanding: 0, redeemed: 1 }));
  it("a cancellation releases the same right", () => expect(summarizeNativeMakeupSources([root, { ...attempt, status: "CANCELLED" }], [root.id])).toMatchObject({ outstanding: 1, unreserved: 1 }));
  it("a later leave in the same chain stays one right", () => expect(summarizeNativeMakeupSources([root, { ...attempt, status: "CANCELLED", absenceKind: "STUDENT_LEAVE" }, { ...attempt, id: "next", makeupForBookingId: attempt.id }], [root.id])).toMatchObject({ outstanding: 1, reserved: 1 }));
  it("completed ten unrelated historical pairs grant nothing", () => expect(summarizeNativeMakeupSources(Array.from({ length: 10 }, (_, i) => ({ ...attempt, id: `completed-${i}`, status: "ATTENDED" })), [])).toMatchObject({ outstanding: 0 }));
  it("no-show source never grants a right", () => expect(() => summarizeNativeMakeupSources([{ ...root, status: "NO_SHOW", absenceKind: null }], [root.id])).toThrow("INVALID_NATIVE_SOURCE"));
  it("unverified redemption no-show blocks instead of inventing eligibility", () => expect(() => summarizeNativeMakeupSources([root, { ...attempt, status: "NO_SHOW" }], [root.id])).toThrow("UNVERIFIED_NATIVE_MAKEUP_STATUS"));
  it("two active attempts block a misleading count", () => expect(() => summarizeNativeMakeupSources([root, attempt, { ...attempt, id: "duplicate" }], [root.id])).toThrow("AMBIGUOUS_NATIVE_MAKEUP"));
  it("a linked descendant cannot count as a second source", () => expect(() => summarizeNativeMakeupSources([root, { ...attempt, status: "CANCELLED", absenceKind: "STUDENT_LEAVE" }], [root.id, attempt.id])).toThrow("INVALID_NATIVE_SOURCE"));
});
