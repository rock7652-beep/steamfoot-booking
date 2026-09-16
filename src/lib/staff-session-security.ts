import { createHmac, timingSafeEqual } from "node:crypto";

/** A server-only stamp. Never expose it (or the password hash) in Session.user. */
export type StaffSecurityState = {
  id: string;
  role: string;
  status: string;
  passwordHash: string | null;
  updatedAt: Date;
  staff: { id: string; storeId: string; status: string } | null;
};

export function isStaffSessionRole(role: unknown): boolean {
  return typeof role === "string" && [
    "ADMIN", "OWNER", "PARTNER", "BRANCH_MANAGER", "INTERN_MANAGER", "MANAGER",
  ].includes(role);
}

export function createStaffSessionStamp(state: StaffSecurityState): string | null {
  if (!isStaffSessionRole(state.role) || state.status !== "ACTIVE" || !state.passwordHash) {
    return null;
  }
  if (state.role !== "ADMIN" && (!state.staff || state.staff.status !== "ACTIVE")) {
    return null;
  }
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Staff session validation requires the auth secret");
  // User.updatedAt also prevents an old session reviving after suspend/reactivate
  // or demote/promote. This deliberately requires re-login after User edits.
  const payload = JSON.stringify([
    "staff-session-v1", state.id, state.role, state.status, state.passwordHash,
    state.updatedAt.toISOString(),
    state.role === "ADMIN" ? null : [state.staff!.id, state.staff!.storeId, state.staff!.status],
  ]);
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function matchesStaffSessionStamp(stamp: unknown, state: StaffSecurityState): boolean {
  if (typeof stamp !== "string" || !/^[a-f0-9]{64}$/.test(stamp)) return false;
  const expected = createStaffSessionStamp(state);
  return expected !== null && timingSafeEqual(Buffer.from(stamp, "hex"), Buffer.from(expected, "hex"));
}
