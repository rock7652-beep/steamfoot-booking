import {describe,expect,it} from "vitest";
import { readMusicOpeningCard,readMusicOpeningLesson,musicOpeningOperationIssue,musicOpeningSessionChangeIssue } from "@/lib/music-opening-runtime";
import {syntheticOpeningCard,syntheticOpeningBooking,syntheticOpeningRecord,syntheticOpeningRow,syntheticOpeningScope} from "./fixtures/music-opening";
const store=syntheticOpeningScope.targetStoreId;
describe("validated runtime opening identity",()=>{
  it("keeps native cards on the unchanged path",()=>{
    expect(readMusicOpeningCard(null,store)).toEqual({kind:"NATIVE"});
    expect(readMusicOpeningCard({musicOpeningStateRequired:false},store)).toEqual({kind:"NATIVE"});
  });
  it("blocks a missing row even when no booking metadata survives",()=>{
    expect(readMusicOpeningCard({...syntheticOpeningCard(),musicOpeningState:null},store).kind).toBe("BLOCKED");
  });
  it.each(["id","storeId","unit"])("blocks mismatched card %s",field=>{
    expect(readMusicOpeningCard({...syntheticOpeningCard(),[field]:"wrong"},store).kind).toBe("BLOCKED");
  });
  it.each(["sourceKey","contentHash","cardId","storeId","customerId"])("blocks mismatched state %s",field=>{
    const card=syntheticOpeningCard();card.musicOpeningState={...card.musicOpeningState,[field]:"wrong"};
    expect(readMusicOpeningCard(card,store,"synthetic-student").kind).toBe("BLOCKED");
  });
  it("blocks an unmarked opening row and shared membership",()=>{
    expect(readMusicOpeningCard({...syntheticOpeningCard(),musicOpeningStateRequired:false},store).kind).toBe("BLOCKED");
    expect(readMusicOpeningCard({...syntheticOpeningCard(),members:[{customerId:"synthetic-student"},{customerId:"other"}]},store).kind).toBe("BLOCKED");
  });
  it("returns source term seven/ordinal three without relying on catalogue points",()=>{
    const booking=syntheticOpeningBooking();const state=readMusicOpeningCard(booking.card,store,booking.customerId);
    expect(readMusicOpeningLesson(state,booking)).toMatchObject({kind:"OPENING",originalTermNumber:7,originalLessonOrdinal:3,originalTermLessonCount:4,closedBeforeCutoff:2});
  });
  it.each([
    {pointCost:0},{pointCost:5},{bookingKind:"TRIAL"},{bookingKind:"TEACHER_MAKEUP"},{companionIndex:1},{makeupForBookingId:"unresolved"},
    {musicOpeningTermKey:null},{musicOpeningLessonOrdinal:1},{musicOpeningSourceLessonKey:null},{customerId:"other"},
  ])("blocks unsupported imported lesson semantics %j",patch=>{
    const booking=syntheticOpeningBooking();const state=readMusicOpeningCard(booking.card,store,booking.customerId);
    expect(readMusicOpeningLesson(state,{...booking,...patch}).kind).toBe("BLOCKED");
  });
  it("rejects imported metadata on a native card",()=>{
    expect(readMusicOpeningLesson({kind:"NATIVE"},syntheticOpeningBooking()).kind).toBe("BLOCKED");
  });
  it.each(["reservedAtCutoff","unresolvedMakeupLessons"] as const)("does not invent a reconciliation for %s",field=>{
    const record=syntheticOpeningRecord();record.balance[field]=1;
    const card=syntheticOpeningCard(record);const state=readMusicOpeningCard(card,store);
    expect(state.kind).toBe("OPENING");expect(musicOpeningOperationIssue(state,card)).toContain("來源連結");
  });
  it("blocks unknown validity or a live expiry that drifted from its source",()=>{
    const record={...syntheticOpeningRecord(),activatedAt:null,expiresAt:null};const card=syntheticOpeningCard(record);
    expect(musicOpeningOperationIssue(readMusicOpeningCard(card,store),card)).toContain("未確認");
    const drifted={...syntheticOpeningCard(),expiresAt:new Date("2099-01-01")};
    expect(musicOpeningOperationIssue(readMusicOpeningCard(drifted,store),drifted)).toContain("不一致");
  });
  it("calendar moves cannot cross cutoff or original expiry and keep source ordinal",()=>{
    const booking=syntheticOpeningBooking();
    expect(musicOpeningSessionChangeIssue(store,booking,new Date("2026-09-30T15:59:59.999Z"))).toContain("切點前");
    expect(musicOpeningSessionChangeIssue(store,booking,new Date("2026-12-01T00:00:00Z"))).toContain("有效期限");
    expect(musicOpeningSessionChangeIssue(store,booking,new Date("2026-10-15T02:00:00Z"))).toBeNull();
    expect(booking.musicOpeningLessonOrdinal).toBe(3);
  });
  it("a malformed JSON snapshot fails closed",()=>{
    const card=syntheticOpeningCard(); const row=syntheticOpeningRow();
    expect(readMusicOpeningCard({...card,musicOpeningState:{...row,snapshot:{bad:true}}},store).kind).toBe("BLOCKED");
  });
});

describe("opening makeup isolation from ordinary source lessons",()=>{
  it.each([
    {bookingKind:"OPENING_MAKEUP",musicOpeningMakeupEntitlementId:null},
    {bookingKind:"CARD",musicOpeningMakeupEntitlementId:"right"},
    {bookingKind:"TRIAL",musicOpeningMakeupEntitlementId:""},
  ])("rejects either marker before native fallthrough: %j",patch=>{
    const booking={...syntheticOpeningBooking(),...patch,card:null};
    expect(readMusicOpeningLesson({kind:"NATIVE"},booking)).toMatchObject({kind:"BLOCKED",issue:expect.stringContaining("期初補課")});
    expect(musicOpeningSessionChangeIssue(store,booking,new Date("2026-10-15T02:00:00Z"))).toContain("期初補課");
  });
});
