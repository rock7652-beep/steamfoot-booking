import { expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseScheduleBoard } from "@/app/(dashboard)/dashboard/courses/course-schedule-board";
vi.mock("@/server/actions/course-slot-matches",()=>({getMusicSlotMatches:vi.fn()}));
import { readFileSync } from "node:fs";
import { courseAttendanceProgress, courseAttendanceState } from "@/lib/course-attendance-visual";

it("only darkens a class after every learner has a recorded result", () => {
  const pending = courseAttendanceProgress([
    { status: "ATTENDED" }, { status: "NO_SHOW" }, { status: "RESERVED" },
  ]);
  expect(pending).toEqual({ total: 3, processed: 2, complete: false });
  expect(courseAttendanceProgress([
    { status: "ATTENDED" }, { status: "NO_SHOW" }, { status: "CANCELLED" },
  ], 1)).toEqual({ total: 3, processed: 3, complete: true });
});

it("counts check-in, excludes ordinary cancellation, and keeps empty classes light", () => {
  expect(courseAttendanceProgress([
    { status: "RESERVED", checkedInAt: "2026-09-26T01:00:00Z" },
    { status: "CANCELLED" },
  ])).toEqual({ total: 1, processed: 1, complete: true });
  expect(courseAttendanceProgress([{ status: "RESERVED" }, { status: "CANCELLED" }]))
    .toEqual({ total: 1, processed: 0, complete: false });
  expect(courseAttendanceProgress([{ status: "CANCELLED" }]))
    .toEqual({ total: 0, processed: 0, complete: false });
});

it("teacher absence completes a private or group class without marking or charging learners", () => {
  const bookings = [{ status: "RESERVED" }, { status: "RESERVED" }, { status: "RESERVED" }, { status: "RESERVED" }];
  expect(courseAttendanceState(bookings, 0, "NO_SHOW")).toEqual({ total: 4, processed: 0, teacherAbsent: true, complete: true });
  expect(courseAttendanceState(bookings, 0, "LEAVE")).toMatchObject({ processed: 0, teacherAbsent: true, complete: true });
  expect(courseAttendanceState(bookings, 0, "SCHEDULED")).toMatchObject({ processed: 0, teacherAbsent: false, complete: false });
  expect(courseAttendanceState([{status:"ATTENDED"},{status:"NO_SHOW"},...bookings.slice(2)], 0)).toMatchObject({total:4,processed:2,complete:false});
  expect(courseAttendanceState([{status:"ATTENDED"},{status:"NO_SHOW"},{status:"ATTENDED"},{status:"ATTENDED"}], 0)).toMatchObject({total:4,processed:4,complete:true});
  expect(bookings.every(booking=>booking.status==="RESERVED")).toBe(true);
});

it("counts both kinds of leave once, excludes cancelled reservations, and reverses corrections", () => {
  const bookings = [
    ...Array.from({length: 7}, () => ({status: "ATTENDED"})),
    {status: "NO_SHOW"},
    {status: "CANCELLED", absenceKind: "STUDENT_LEAVE"},
    {status: "CANCELLED", absenceKind: "GROUP_LEAVE_FORFEITED"},
    {status: "CANCELLED"},
  ];
  expect(courseAttendanceProgress(bookings, 2)).toEqual({total: 10, processed: 10, complete: true});
  expect(courseAttendanceProgress([{status: "RESERVED"}, ...bookings.slice(1)])).toEqual({total: 10, processed: 9, complete: false});
  expect(courseAttendanceProgress(bookings.slice(8, 10))).toEqual({total: 2, processed: 2, complete: true});
});

it("fitness cards show attendance progress using the ownership-filtered roster", () => {
  const board = readFileSync("src/app/(dashboard)/dashboard/courses/course-schedule-board.tsx", "utf8");
  expect(board).toContain("courseAttendanceState(session.displayBookings ?? session.bookings, 0, session.teacherAttendance)");
  const markup=renderToStaticMarkup(React.createElement(CourseScheduleBoard,{
    businessProfile:"FITNESS",mode:"week",selectedDate:"2026-10-02",today:"2026-10-02",
    rooms:[{id:"room",name:"A",isActive:true}],coaches:[{id:"coach",displayName:"教練",status:"ACTIVE",courseCoachEnabled:true}],templates:[{id:"t",name:"瑜珈",classType:"GROUP"}],
    sessions:[{id:"s",templateId:"t",nameSnapshot:"瑜珈",roomId:"room",coachId:"coach",startsAt:"2026-10-02T02:00:00Z",endsAt:"2026-10-02T03:00:00Z",pointCost:2,capacity:10,
      bookings:[{customerId:"1",customerName:"甲",status:"ATTENDED",bookingKind:"MEMBER"},{customerId:"2",customerName:"乙",status:"ATTENDED",bookingKind:"MEMBER"},{customerId:"3",customerName:"丙",status:"RESERVED",bookingKind:"MEMBER"}],
      displayBookings:[{customerId:"1",customerName:"甲",status:"ATTENDED",bookingKind:"MEMBER"},{customerId:"3",customerName:"丙",status:"RESERVED",bookingKind:"MEMBER"}]}],
    storePeriods:[],staffAvailability:[],staffAvailabilityExceptions:[],onOpenEmpty:()=>{},onSelectDate:()=>{},onOpenSession:()=>{},
  }));
  expect(markup).toContain('title="點名完成度"');
  expect(markup).toContain('>1/2</span>');
  expect(board).not.toContain('activeBookings.every');
});
