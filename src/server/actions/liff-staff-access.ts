"use server";

import { requireSession } from "@/lib/session";
import { resolveActiveStaffMemberForStore } from "@/server/services/staff-member-access";
import { resolveMemberRequestStoreId } from "@/server/services/member-request-store";

export async function fetchLiffStaffAccess() {
  try {
    const user = await requireSession();
    const storeId = await resolveMemberRequestStoreId(user.storeId);
    if (!storeId) return { status: "no_access" as const };
    const access = await resolveActiveStaffMemberForStore(user.id, storeId);
    return access ? { status: "ok" as const, staffName: access.staffName } : { status: "no_access" as const };
  } catch {
    return { status: "no_access" as const };
  }
}
