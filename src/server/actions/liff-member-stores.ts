"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CENTRAL_MEMBER_STORE_COOKIE } from "@/lib/central-member-store";
import { getCurrentUser, requireSession } from "@/lib/session";
import { resolveCentralMembershipsForUser } from "@/server/services/central-member-resolver";

export type LiffMemberStoreOption = {
  storeName: string;
  storeSlug: string;
};

export type LiffMemberStoreContext =
  | {
      status: "signed_in";
      currentStoreSlug: string;
      displayName: string | null;
      stores: LiffMemberStoreOption[];
    }
  | { status: "not_signed_in" };

const SELECTABLE_STORE_STATUSES = new Set(["ACTIVE", "TRIAL"]);

/**
 * Returns only server-verified memberships. Customer/store identifiers never
 * cross the client boundary, and an unverified URL store fails closed.
 */
export async function fetchLiffMemberStoreContext(): Promise<LiffMemberStoreContext> {
  const user = await getCurrentUser();
  if (
    !user ||
    user.role !== "CUSTOMER" ||
    !user.customerId ||
    !user.storeId ||
    !user.storeSlug
  ) {
    return { status: "not_signed_in" };
  }

  const resolved = await resolveCentralMembershipsForUser(user.id);
  const current = resolved.memberships.find(
    (membership) =>
      membership.storeId === user.storeId &&
      membership.customerId === user.customerId &&
      membership.storeSlug === user.storeSlug,
  );
  if (!current || !SELECTABLE_STORE_STATUSES.has(current.storeOperatingStatus)) {
    return { status: "not_signed_in" };
  }

  return {
    status: "signed_in",
    currentStoreSlug: current.storeSlug,
    displayName: current.customerName || null,
    stores: resolved.memberships
      .filter((membership) =>
        SELECTABLE_STORE_STATUSES.has(membership.storeOperatingStatus),
      )
      .map((membership) => ({
        storeName: membership.storeName,
        storeSlug: membership.storeSlug,
      })),
  };
}

/**
 * Store selection is validated again on the server. The redirect target is a
 * fixed LIFF route built from a verified membership, never a client URL.
 */
export async function selectLiffMemberStoreAction(
  formData: FormData,
): Promise<never> {
  const user = await requireSession();
  if (user.role !== "CUSTOMER") redirect("/");

  const requestedSlug = String(formData.get("storeSlug") ?? "").trim();
  const resolved = await resolveCentralMembershipsForUser(user.id);
  const selectable = resolved.memberships.filter((membership) =>
    SELECTABLE_STORE_STATUSES.has(membership.storeOperatingStatus),
  );
  const membership = selectable.find(
    (candidate) => candidate.storeSlug === requestedSlug,
  );

  if (!membership) {
    const fallback = selectable.find(
      (candidate) => candidate.storeId === user.storeId,
    ) ?? selectable[0];
    if (!fallback) redirect("/");
    redirect(`/s/${fallback.storeSlug}/liff?storeSwitchError=1`);
  }

  const cookieStore = await cookies();
  cookieStore.set(CENTRAL_MEMBER_STORE_COOKIE, membership.storeSlug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(`/s/${membership.storeSlug}/liff?storeSwitched=1`);
}
