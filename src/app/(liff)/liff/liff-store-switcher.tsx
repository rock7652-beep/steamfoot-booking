"use client";

import { selectLiffMemberStoreAction, type LiffMemberStoreOption } from "@/server/actions/liff-member-stores";
import { MemberStoreSwitcher } from "@/components/member-store-switcher";

export function LiffStoreSwitcher({ currentStoreSlug, currentStoreName, stores }: {
  currentStoreSlug: string;
  currentStoreName: string;
  stores: LiffMemberStoreOption[];
}) {
  return <MemberStoreSwitcher currentStoreSlug={currentStoreSlug} currentStoreName={currentStoreName} stores={stores} action={selectLiffMemberStoreAction} />;
}
