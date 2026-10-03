"use server";

import { requireSession } from "@/lib/session";
import { resolveActiveStaffMemberForStore } from "@/server/services/staff-member-access";
import { resolveMemberRequestStoreId } from "@/server/services/member-request-store";
import { readLiffStaffWork } from "@/server/queries/spa-liff-staff-work";

export type LiffStaffWorkRow = {
  id: string;
  startTime: string;
  endTime: string;
  customerName: string;
  serviceName: string;
  locationName: string;
  status: string;
  note: string | null;
  items: Array<{
    name: string;
    variant: string | null;
    serviceMinutes: number;
    bufferMinutes: number;
  }>;
};

export type LiffStaffWorkCalendarDay = {
  date: string;
  bookingCount: number;
  isLeave: boolean;
};

export type FetchLiffStaffWorkResult =
  | { status: "ok"; staffName: string; selectedDate: string; rows: LiffStaffWorkRow[]; calendarDays: LiffStaffWorkCalendarDay[] }
  | { status: "no_access" }
  | { status: "service_unavailable" };

export async function fetchLiffStaffWork(input?: { date?: string }): Promise<FetchLiffStaffWorkResult> {
  let user;
  try {
    user = await requireSession();
  } catch {
    return { status: "no_access" };
  }
  try {
    const storeId = await resolveMemberRequestStoreId(user.storeId);
    if (!storeId) return { status: "no_access" };
    const access = await resolveActiveStaffMemberForStore(user.id, storeId);
    if (!access) return { status: "no_access" };

    return await readLiffStaffWork(access, input);
  } catch (error) {
    console.error("[fetchLiffStaffWork] failed", error);
    return { status: "service_unavailable" };
  }
}
