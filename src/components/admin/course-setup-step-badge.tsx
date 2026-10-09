"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { courseSetupSteps, currentCourseSetupStep } from "@/lib/course-setup-progress";

const steps = courseSetupSteps({ coaches: 0, rooms: 0, templates: 0, plans: 0, sessions: 0, qualifiedCoaches: 0 });

/** Keep the guide context visible inside a modal rather than behind its backdrop. */
export function CourseSetupStepBadge({ step }: { step: "hours" | "room" | "course" | "plan" | "coach" | "schedule" }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const index = currentCourseSetupStep(steps, pathname, search.toString());
  if (index < 0 || steps[index].id !== step) return null;
  return <span className="ml-2 inline-block text-sm font-normal text-primary-700">第 {index + 1}/6 步</span>;
}
