"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { resolveCentralMembershipsForUser } from "@/server/services/central-member-resolver";
import { CENTRAL_MEMBER_STORE_COOKIE } from "@/lib/central-member-store";

export async function selectCentralMemberStoreAction(formData: FormData): Promise<never> {
  const user = await requireSession();
  if (user.role !== "CUSTOMER") redirect("/");

  const requestedSlug = String(formData.get("storeSlug") ?? "").trim();
  const resolved = await resolveCentralMembershipsForUser(user.id);
  const membership = resolved.memberships.find(
    (candidate) => candidate.storeSlug === requestedSlug,
  );

  if (!membership) redirect("/store-select");

  const cookieStore = await cookies();
  cookieStore.set(CENTRAL_MEMBER_STORE_COOKIE, membership.storeSlug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(`/s/${membership.storeSlug}/book?storeSwitched=1`);
}
