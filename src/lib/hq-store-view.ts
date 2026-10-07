import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { UserRole } from "@prisma/client";

/** A capability context only: never replace the authenticated/audited user. */
const selectedStoreView = cache(async (): Promise<boolean> => {
  const pathname = (await headers()).get("x-next-pathname") ?? "";
  if (/^\/s\/[^/]+\/admin(?:\/|$)/.test(pathname)) return true;
  const selected = (await cookies()).get("active-store-id")?.value;
  // Missing route headers on actions must not restore HQ capabilities.
  return !!selected && selected !== "__all__";
});

export async function isHqStoreView(user: { role: string }): Promise<boolean> {
  return user.role === "ADMIN" && selectedStoreView();
}

/** No role selector exists: use the existing store-owner capability policy. */
export async function getEffectiveStoreRole(user: { role: UserRole }): Promise<UserRole> {
  return await isHqStoreView(user) ? "OWNER" : user.role;
}
