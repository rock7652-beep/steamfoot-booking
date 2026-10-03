"use client";

import { CourseScheduleBoard } from "../course-schedule-board";

type BoardData = Omit<React.ComponentProps<typeof CourseScheduleBoard>,
  "onOpenEmpty" | "onSelectDate" | "onOpenSession">;

export function LubyRealDayBoard(props: BoardData) {
  return (
    <CourseScheduleBoard
      {...props}
      onOpenEmpty={() => {}}
      onSelectDate={() => {}}
      onOpenSession={() => {}}
    />
  );
}
