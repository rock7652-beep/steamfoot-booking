import "server-only";
import { courseSchedulingModeAllowed, type CourseSchedulingModes } from "@/lib/course-scheduling-modes";
import { AppError } from "@/lib/errors";
export function assertCourseSchedulingMode(rule: CourseSchedulingModes | null | undefined, mode: "OPEN" | "ASSIGNED") {
  if (!courseSchedulingModeAllowed(rule, mode)) throw new AppError("FORBIDDEN", mode === "OPEN" ? "店家已關閉開放選課，請核對排課模式" : "店家已關閉指定學員，請核對排課模式");
}
