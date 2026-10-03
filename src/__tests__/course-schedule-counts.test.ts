import { expect, it } from "vitest";
import { scheduleAssignedBookings, scheduleOccupiedCount, scheduleRosterBookings } from "@/lib/course-schedule-counts";
import { scheduleOnDate, scheduleTotals } from "@/lib/music-schedule-audit";

const bookings = [
  {customerId:"present",status:"ATTENDED",assignedCoachId:"manager-a"},
  {customerId:"absent",status:"NO_SHOW",assignedCoachId:"manager-a"},
  {customerId:"leave",status:"CANCELLED",absenceKind:"STUDENT_LEAVE",assignedCoachId:"manager-a"},
  {customerId:"forfeit",status:"CANCELLED",absenceKind:"GROUP_LEAVE_FORFEITED",assignedCoachId:"manager-b"},
  {customerId:"reserved",status:"RESERVED",assignedCoachId:null},
  {customerId:"cancelled",status:"CANCELLED",assignedCoachId:"manager-a"},
];
const session = {id:"s",startsAt:"2026-10-01T02:00:00Z",endsAt:"2026-10-01T03:00:00Z",roomId:"r",coachId:"t",bookings};

it("retains leaves in the register, excludes cancellations, and counts occupied seats independently",()=>{
  expect(scheduleRosterBookings(bookings).map(b=>b.customerId)).toEqual(["present","absent","leave","forfeit","reserved"]);
  expect(scheduleOccupiedCount(bookings)).toBe(3);
  expect(scheduleAssignedBookings(bookings,"manager-a").map(b=>b.customerId)).toEqual(["present","absent","leave"]);
  expect(scheduleAssignedBookings(bookings,"none").map(b=>b.customerId)).toEqual(["reserved"]);
});

it("day, week and month totals use ownership matches while retaining all bookings for capacity and conflicts",()=>{
  const filtered = {...session,displayBookings:scheduleAssignedBookings(bookings,"manager-a")};
  expect(scheduleTotals([session]).people).toBe(5);
  expect(scheduleTotals([filtered]).people).toBe(3);
  expect(scheduleTotals(scheduleOnDate([filtered],"2026-10-01")).people).toBe(3);
  expect(scheduleOccupiedCount(filtered.bookings)).toBe(3);
  expect(filtered.bookings).toBe(bookings);
  expect(scheduleTotals([{...filtered,previewFaded:"教師請假"}])).toEqual({classes:0,people:0,rentals:0});
  expect(scheduleTotals([{...filtered,displayBookings:[]}]).people).toBe(0);
});
