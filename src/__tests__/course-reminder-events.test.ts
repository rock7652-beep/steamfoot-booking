import { expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({prisma:{}}));
vi.mock("@/lib/course-db", () => ({coursePrisma:{}}));
vi.mock("@/server/services/course-delivery-links", () => ({
  courseMemberNotificationUrl: (slug:string,_view:string,date:string) => new URL(`https://example.test/s/${slug}?date=${date}`),
  courseBookingActionUrl: (slug:string,date:string,id:string,action:string) => `https://example.test/s/${slug}?date=${date}&id=${id}&action=${action}`,
}));
import { prepareCourseReminderEvent, courseReminderRetryKey } from "@/server/services/course-reminder-events";

type Candidate = Parameters<typeof prepareCourseReminderEvent>[0];
const candidate = {
  store:{id:"store-a",slug:"music-a",name:"教室"},date:"2026-10-15",
  customer:{id:"learner",name:"學員",lineUserId:"unverified-line-id"},
  booking:{id:"booking-a",bookingKind:"TRIAL",session:{startsAt:new Date("2026-10-15T02:00:00Z"),endsAt:new Date("2026-10-15T03:00:00Z"),nameSnapshot:"課程 · 83f866"}},
} as Candidate;
const now = new Date("2026-10-13T16:30:00Z");

it("prepares local-date content and trial actions without selecting an external recipient", () => {
  const event = prepareCourseReminderEvent(candidate,"提醒內容",now,{address:"地址",mapUrl:"https://maps.example.test"});
  expect(event.body).not.toContain("83f866");
  expect(event.messageInput.serviceName).toBe("課程");
  expect(event.triggerAt).toEqual(new Date("2026-10-14T10:00:00Z"));
  expect(event.messageInput).toMatchObject({bookingTime:"10:00",serviceDuration:"60 分鐘",reminderText:"提醒內容",courseActions:{confirm:expect.stringContaining("action=confirm")}});
  expect(event.body).toContain("提醒內容\nhttps://example.test/s/music-a?date=2026-10-15");
  expect(event).not.toHaveProperty("recipientLineUserId");
  expect(event.messageInput).not.toHaveProperty("lineUserId");
});
it("keeps delivery identity across retries and separates stores and rescheduled lessons", () => {
  const original = prepareCourseReminderEvent(candidate,"原文",now,null);
  const retry = prepareCourseReminderEvent(candidate,"新文",new Date("2026-10-14T03:00:00Z"),null);
  expect(retry.id).toBe(original.id);
  expect(courseReminderRetryKey(retry.id)).toBe(courseReminderRetryKey(original.id));
  expect(courseReminderRetryKey(original.id)).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
  expect(prepareCourseReminderEvent({...candidate,store:{...candidate.store,id:"store-b"}},"文",now,null).id).not.toBe(original.id);
  expect(prepareCourseReminderEvent({...candidate,booking:{...candidate.booking,session:{...candidate.booking.session,startsAt:new Date("2026-10-15T04:00:00Z")}}},"文",now,null).id).not.toBe(original.id);
});
it("omits trial confirmation on ordinary bookings and excludes non-HTTPS map links", () => {
  const event = prepareCourseReminderEvent({...candidate,booking:{...candidate.booking,bookingKind:"CARD"}},"文",now,{address:null,mapUrl:"http://example.test"});
  expect(event.messageInput.courseActions).not.toHaveProperty("confirm");
  expect(event.messageInput.mapUrl).toBeUndefined();
});
