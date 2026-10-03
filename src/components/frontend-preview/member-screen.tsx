"use client";
import { useState } from "react";
import { WelcomeBack } from "@/app/(liff)/liff/liff-shell";
import { ReadyView } from "@/app/(liff)/liff/bookings/_components/ready-view";
import { WalletReadyView } from "@/app/(liff)/liff/wallets/wallets-list";
import { getIndustryModule, type IndustryModuleId } from "@/lib/industry-modules";
import type { FetchLiffBookingsResult } from "@/server/actions/liff-my-bookings";
import type { FetchLiffWalletsResult } from "@/server/actions/liff-my-wallets";

export function PreviewMemberScreen({ bookings, wallets, moduleId, name, storeName, storeSlug, href, view }: {
  bookings: FetchLiffBookingsResult; wallets: FetchLiffWalletsResult; moduleId: IndustryModuleId; name: string;
  storeName: string; storeSlug: string; href: string; view: string;
}) {
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  if (bookings.status !== "ok" || wallets.status !== "ok") return <p role="alert" className="p-5">目前無法讀取資料，請重新整理。</p>;
  const links = { bookings: `${href}&view=bookings`, wallets: `${href}&view=wallets`, profile: "/preview-unavailable" };
  return <main className="mx-auto max-w-md space-y-3 bg-earth-50 p-4">
    <h1 className="text-xl font-semibold text-primary-900">{storeName}</h1>
    <nav className="flex gap-2" aria-label="會員預覽分頁">{[["home", "首頁"], ["bookings", "我的預約"], ["wallets", "我的方案"]].map(([key, label]) => <a key={key} aria-current={view === key ? "page" : undefined} href={`${href}&view=${key}`} className="min-h-11 rounded-lg border border-earth-200 bg-white px-3 py-3 text-sm">{label}</a>)}</nav>
    {view === "bookings" ? <ReadyView upcoming={bookings.upcoming} history={bookings.history} tab={tab} onTabChange={setTab} storeName={storeName} storeSlug={storeSlug} onRequestCancel={() => window.alert("預覽中不會儲存")} contactUrl="" storeAddress="" storeMapUrl="" bookingHref="/preview-unavailable" />
      : view === "wallets" ? <WalletReadyView {...wallets} readOnly consumption={[]} storeSlug={storeSlug} contactUrl="" dataSource={moduleId} />
      : <WelcomeBack storeSlug={storeSlug} displayName={name} memberDataSource={moduleId} terminology={getIndustryModule(moduleId).customer} healthAssessmentEnabled={false} memberLinks={links} bookingHref="/preview-unavailable" memberSummary={{ walletsStatus: "ok", activeWallets: wallets.active, makeupCredits: wallets.makeupCredits, upcomingBookings: bookings.upcoming, nextBooking: bookings.upcoming[0] ?? null, healthSummary: null, referralShare: null }} />}
  </main>;
}
