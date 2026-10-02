import type { ReactNode } from "react";

export function CourseScheduleToolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div aria-label="課表資訊與操作" className={`flex min-h-11 max-w-full items-center gap-x-3 overflow-x-auto pb-0.5 text-sm text-earth-700 [&>*]:shrink-0 ${className}`}>{children}</div>;
}
