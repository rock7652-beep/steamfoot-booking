"use client";

import { selectCentralMemberStoreAction } from "@/server/actions/central-member-store";
import { MemberStoreSwitcher } from "@/components/member-store-switcher";

export interface CustomerStoreOption { storeId: string; storeName: string; storeSlug: string }

export function CentralMemberStoreSwitcher({ currentStoreName, currentStoreSlug, stores, compact = false, disabled = false, onBeforeSwitch, returnToLiff = false, align = "end" }: {
  currentStoreName: string;
  currentStoreSlug: string;
  stores: CustomerStoreOption[];
  compact?: boolean;
  disabled?: boolean;
  onBeforeSwitch?: () => boolean;
  returnToLiff?: boolean;
  align?: "center" | "end";
}) {
  return <MemberStoreSwitcher currentStoreSlug={currentStoreSlug} currentStoreName={currentStoreName} stores={stores} action={selectCentralMemberStoreAction} disabled={disabled} onBeforeSwitch={onBeforeSwitch} hiddenFields={returnToLiff ? { memberEntry: "liff" } : undefined} fullWidth={!compact} centered={align === "center"} />;
}
