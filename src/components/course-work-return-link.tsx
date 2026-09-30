"use client";

import { rememberCoursePortalRole } from "@/lib/course-portal-role";

export function CourseWorkReturnLink({ href, cookieName }: { href: string; cookieName: string }) {
  return <a className="inline-flex min-h-11 items-center underline" href={href}
    onClick={() => rememberCoursePortalRole(cookieName, "coach")}>返回我的工作</a>;
}
