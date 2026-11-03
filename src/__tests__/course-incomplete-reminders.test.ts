import { beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const m = vi.hoisted(() => ({ query:vi.fn(),oldCandidates: vi.fn(), oldRecheck: vi.fn(), candidates: vi.fn(), recheck: vi.fn(), claim: vi.fn(), update: vi.fn(), remove: vi.fn(),record:vi.fn(),resolve:vi.fn(), notify: vi.fn(),feature:vi.fn() }));
vi.mock("@/server/queries/course-manager-todos", () => ({ getIncompleteCourseCandidates: m.candidates, isCourseBookingStillIncomplete: m.recheck }));
vi.mock("@/server/services/store-manager-line-notifications", () => ({ notifyStoreManagerOnLine: m.notify }));
vi.mock("@/server/services/digital-manager-notices",()=>({recordDigitalManagerNotice:m.record,resolveDigitalManagerNotice:m.resolve}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:m.feature}));
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw:m.query,booking: { findMany: m.oldCandidates, findFirst: m.oldRecheck }, digitalButlerExecutionLog: { create: m.claim, update: m.update, delete: m.remove } } }));
import { runIncompleteServiceReminders } from "@/server/services/incomplete-service-reminders";
const now = new Date("2026-09-17T04:00:00Z");
beforeEach(() => { vi.resetAllMocks();m.query.mockResolvedValue([]); m.feature.mockResolvedValue(true);m.remove.mockResolvedValue({}); m.oldCandidates.mockResolvedValue([]); m.candidates.mockResolvedValue([{ id: "booking", storeId: "course", storeSlug: "course-store", sessionId: "session", customerName: "Learner", session: { startsAt: new Date("2026-09-17T00:00:00Z"), endsAt: new Date("2026-09-17T03:00:00Z") } }]); m.recheck.mockResolvedValue({ id: "booking" }); m.claim.mockResolvedValue({ id: "claim" }); m.notify.mockResolvedValue({ status: "skipped", reason: "recipient_not_configured" }); });
it("uses actual end for a three-hour class and the existing delivery/claim service", async () => {
  await runIncompleteServiceReminders(now);
  expect(m.oldCandidates).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ store: expect.objectContaining({ industryModule: "STEAMFOOT" }) }) }));
  expect(m.recheck).toHaveBeenCalledWith("course", "booking", now,{sessionId:"session",endsAt:new Date("2026-09-17T03:00:00Z")});
  expect(m.oldRecheck).not.toHaveBeenCalled();
  expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ eventKey: "course-incomplete-attendance:booking", courseSessionId: "session", storeSlug: "course-store", customerName: "Learner", bookingDate: "2026-09-17", slotTime: "08:00" }));
  expect(m.remove).toHaveBeenCalledWith({ where: { id: "claim" } });
});
it("does not notify before grace expires or after concurrent attendance/cancellation", async () => {
  await runIncompleteServiceReminders(new Date("2026-09-17T03:59:59Z"));
  expect(m.notify).not.toHaveBeenCalled(); expect(m.claim).not.toHaveBeenCalled();
  m.recheck.mockResolvedValue(null);
  await runIncompleteServiceReminders(now);
  expect(m.notify).not.toHaveBeenCalled(); expect(m.record).not.toHaveBeenCalled();
});
it("creates the store notice even when the store has no LINE reminder entitlement",async()=>{
 m.feature.mockResolvedValue(false);
 await runIncompleteServiceReminders(now);
 expect(m.record).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({storeId:'course',eventType:'INCOMPLETE_SERVICE_REMINDER',targetId:'booking'}));
 expect(m.claim).not.toHaveBeenCalled();expect(m.notify).not.toHaveBeenCalled();
});
it('records the store notice before a failed LINE feature lookup',async()=>{
 m.feature.mockRejectedValue(new Error('LINE feature unavailable'));const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{await runIncompleteServiceReminders(now);expect(m.record).toHaveBeenCalledOnce();expect(m.notify).not.toHaveBeenCalled();}finally{log.mockRestore();}
});
it('resolves a stale course notice when a lesson changes before notice insertion, even with LINE disabled',async()=>{
 m.feature.mockResolvedValue(false);m.recheck.mockResolvedValueOnce({id:'booking'}).mockResolvedValueOnce(null);
 await runIncompleteServiceReminders(now);
 expect(m.record).toHaveBeenCalledOnce();expect(m.resolve).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({storeId:'course',eventKey:'course-incomplete-attendance:booking:2026-09-17T03:00:00.000Z'}));
 expect(m.claim).not.toHaveBeenCalled();expect(m.notify).not.toHaveBeenCalled();
});
it('resolves a stale steamfoot reminder when the original date or time no longer matches',async()=>{
 m.candidates.mockResolvedValue([]);m.oldCandidates.mockResolvedValue([{id:'old',storeId:'steamfoot',store:{slug:'steamfoot'},bookingDate:new Date('2026-09-17T00:00:00Z'),slotTime:'09:00',customer:{name:'Existing'}}]);
 m.oldRecheck.mockResolvedValueOnce({id:'old'}).mockResolvedValueOnce(null);
 await runIncompleteServiceReminders(now);
 expect(m.oldRecheck).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({bookingDate:new Date('2026-09-17T00:00:00Z'),slotTime:'09:00'})}));
 expect(m.resolve).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({storeId:'steamfoot',eventKey:'incomplete-service-reminder:old:2026-09-17:09:00'}));
 expect(m.claim).not.toHaveBeenCalled();expect(m.notify).not.toHaveBeenCalled();
});
it("a duplicate claim cannot send a second reminder", async () => {
  m.claim.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" }));
  expect((await runIncompleteServiceReminders(now)).skipped).toBe(1);
  expect(m.notify).not.toHaveBeenCalled();
});
it("a course query failure is reported but does not stop existing service reminders", async () => {
  m.candidates.mockRejectedValue(new Error("course unavailable"));
  m.oldCandidates.mockResolvedValue([{ id: "old", storeId: "steamfoot", store: { slug: "steamfoot" }, bookingDate: new Date("2026-09-17T00:00:00Z"), slotTime: "09:00", customer: { name: "Existing" } }]);
  m.oldRecheck.mockResolvedValue({ id: "old" });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const result = await runIncompleteServiceReminders(now);
  expect(result.failed).toBe(1); expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ eventKey: "incomplete-service-reminder:old", storeId: "steamfoot" }));
  log.mockRestore();
});
it('a steam query failure is reported without stopping course reminders',async()=>{
 m.oldCandidates.mockRejectedValue(new Error('steam unavailable'));const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{const result=await runIncompleteServiceReminders(now);expect(result.failed).toBe(1);expect(m.record).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({storeId:'course',targetId:'booking'}));}finally{log.mockRestore();}
});
it('records overflow store notices without expanding the LINE delivery scan',async()=>{
 m.oldCandidates.mockResolvedValue([]);m.candidates.mockResolvedValue([]);
 m.query.mockResolvedValueOnce([{id:'later',storeId:'steamfoot',store:{slug:'steamfoot'},bookingDate:new Date('2026-09-17T00:00:00Z'),slotTime:'09:00',customer:{name:'QA'},courseSessionId:null,courseEndsAt:null}]).mockResolvedValueOnce([]);
 m.oldRecheck.mockResolvedValue({id:'later'});await runIncompleteServiceReminders(now);
 expect(m.record).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({storeId:'steamfoot',targetId:'later'}));expect(m.notify).not.toHaveBeenCalled();expect(m.claim).not.toHaveBeenCalled();
});
