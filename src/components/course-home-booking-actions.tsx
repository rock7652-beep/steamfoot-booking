"use client";

import {ExclusiveMenu} from "@/components/admin/exclusive-menu";
import {DashboardLink as Link} from "@/components/dashboard-link";

/** The home permission check owns visibility; both original workflows retain their routes. */
export function CourseHomeBookingActions({scheduleHref,service=false}:{scheduleHref:string;service?:boolean}) {
  return service ? <Link className={"inline-flex min-h-11 items-center rounded-lg bg-primary-700 px-3 text-sm font-medium text-white hover:bg-primary-800"} href={`${scheduleHref}&action=booking`}>新增預約</Link> : <ExclusiveMenu label="新增預約" triggerText="新增預約 ▾" className="[&>button]:border-primary-700 [&>button]:bg-primary-700 [&>button]:text-white">
      <Link className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-primary-50" href={`${scheduleHref}&action=booking`}>替學員預約</Link>
      <Link className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-primary-50" href={`${scheduleHref}&action=schedule`}>新增排課</Link>
    </ExclusiveMenu>;
}

