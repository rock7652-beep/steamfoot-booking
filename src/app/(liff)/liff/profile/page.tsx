import { notFound } from "next/navigation";
import {
  resolveCentralMemberLiffId,
  resolveStorePresentation,
  resolveStoreSlugForLiff,
} from "@/lib/store-resolver";
import { liffMessages } from "@/lib/liff/messages";
import { ProfileView } from "./profile-view";

/**
 * /s/[storeSlug]/liff/profile — LIFF 顧客「我的資料」唯讀頁 (PR-LIFF-profile)
 *
 * Server-side scaffold — mirrors `liff/bookings/page.tsx` / `liff/wallets/page.tsx`:
 *   1. `resolveStoreSlugForLiff()` → header / cookie. Missing → NotOpenForLiff.
 *   2. `resolveStorePresentation` → per-store `{ name, slug, liffId, contactUrl }`.
 *      Store not found → notFound(). `liffId` null → NotOpenForLiff.
 *   3. Hand storeSlug / storeName / liffId / contactUrl to client ProfileView,
 *      which runs LIFF init + calls `fetchLiffCustomerProfile` server action.
 *
 * Out of scope (per PR brief):
 *   - No DB writes
 *   - No edit form
 *   - No new `syncLineAccountForUser` callers
 *   - No schema / migration / env changes
 */

export const dynamic = "force-dynamic";

export default async function LiffProfilePage() {
  const storeSlug = await resolveStoreSlugForLiff();
  if (!storeSlug) {
    return <NotOpenForLiff message={liffMessages.error.cannotConfirmStore} />;
  }

  const presentation = await resolveStorePresentation(storeSlug);
  if (!presentation) {
    notFound();
  }
  const liffId = await resolveCentralMemberLiffId();
  if (!liffId) {
    return <NotOpenForLiff message={`${presentation.name} 尚未開通 LINE Mini App`} />;
  }

  return (
    <ProfileView
      storeSlug={presentation.slug}
      storeName={presentation.name}
      liffId={liffId}
      contactUrl={presentation.contactUrl}
    />
  );
}

function NotOpenForLiff({ message }: { message: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-earth-900">LINE Mini App</h1>
      <p className="text-sm text-earth-600">{message}</p>
      <p className="text-xs text-earth-500">請洽分店人員或回到分店首頁。</p>
    </div>
  );
}
