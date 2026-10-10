"use client";
import { HealthPreviewView } from "@/app/(liff)/liff/health/health-view";
import type { HealthSummary } from "@/lib/health-service";
import { LiffBottomNavView } from "@/app/(liff)/liff/liff-bottom-nav";
import { LiffBrandHeader } from "@/app/(liff)/liff/liff-brand-header";
import { LiffMemberFrame } from "@/components/liff-member-frame";
import { ProfileReadyView } from "@/app/(liff)/liff/profile/profile-view";
import type { LiffCustomerProfile } from "@/server/actions/liff-customer-profile";
import { SteamButlerLogo } from "@/components/steam-butler-logo";
import { useState } from "react";
import { WelcomeBack } from "@/app/(liff)/liff/liff-shell";
import { ReadyView } from "@/app/(liff)/liff/bookings/_components/ready-view";
import { WalletReadyView } from "@/app/(liff)/liff/wallets/wallets-list";
import { getIndustryModule, type IndustryModuleId } from "@/lib/industry-modules";
import type { FetchLiffBookingsResult } from "@/server/actions/liff-my-bookings";
import type { FetchLiffWalletsResult } from "@/server/actions/liff-my-wallets";

export function PreviewMemberScreen({ bookings, wallets, moduleId, name, storeName, storeSlug, href, view, profile, healthSummary, healthEnabled }: {
  bookings: FetchLiffBookingsResult; wallets: FetchLiffWalletsResult; moduleId: IndustryModuleId; name: string;
  storeName: string; storeSlug: string; href: string; view: string; profile: LiffCustomerProfile; healthSummary: HealthSummary | null; healthEnabled: boolean;
}) {
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  if (bookings.status !== "ok" || wallets.status !== "ok") return <p role="alert" className="p-5">目前無法讀取資料，請重新整理。</p>;
  const links = { bookings: `${href}&view=bookings`, wallets: `${href}&view=wallets`, profile: `${href}&view=profile`, health: `${href}&view=health` };
  return <LiffMemberFrame preview>
    <LiffBrandHeader home={view === "home"} />
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 pb-4 pt-3">
    {view === "home" && <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold tracking-[0.12em] text-primary-700">{storeName}</p><p className="mt-0.5 text-sm text-earth-500">會員專區</p></div><SteamButlerLogo compact /></header>}
    {view === "health" && healthSummary ? <HealthPreviewView storeSlug={storeSlug} storeName={storeName} summary={healthSummary} /> : view === "profile" ? <ProfileReadyView profile={profile} /> :
    view === "bookings" ? <ReadyView upcoming={bookings.upcoming} history={bookings.history} tab={tab} onTabChange={setTab} storeName={storeName} storeSlug={storeSlug} onRequestCancel={() => window.alert("預覽中不會儲存")} contactUrl="" storeAddress="" storeMapUrl="" bookingHref="/preview-unavailable" />
      : view === "wallets" ? <WalletReadyView {...wallets} readOnly consumption={[]} storeSlug={storeSlug} contactUrl="" dataSource={moduleId} />
      : <WelcomeBack storeSlug={storeSlug} displayName={name} memberDataSource={moduleId} terminology={getIndustryModule(moduleId).customer} healthAssessmentEnabled={healthEnabled} memberLinks={links} bookingHref="/preview-unavailable" memberSummary={{ walletsStatus: "ok", activeWallets: wallets.active, makeupCredits: wallets.makeupCredits, upcomingBookings: bookings.upcoming, nextBooking: bookings.upcoming[0] ?? null, healthSummary, referralShare: null }} compactHome />}
  </main>
  <LiffBottomNavView base={`/s/${storeSlug}/liff`} activeKey={view} healthAssessmentEnabled={healthEnabled} links={{ home: `${href}&view=home`, bookings: links.bookings, wallets: links.wallets, profile: links.profile, health: `${href}&view=health` }} />
  </LiffMemberFrame>;
}
