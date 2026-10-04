import { notFound } from "next/navigation";
import DashboardShell from "@/components/sidebar";
import type { TrialStatus } from "@/lib/shop-config";
import "../../spa-admin.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "後台頂部 RWD 驗收", robots: { index: false, follow: false } };
const trial: TrialStatus = { isFree: true, course: true, staff: { current: 3, limit: 3 }, daysRemaining: 30, trialDays: 30, trialExpired: false, customers: { current: 0, limit: 100, pct: 0 }, bookings: { current: 0, limit: 100, pct: 0 }, overallPct: 0, stage: "normal", canCreateBooking: true, canCreateCustomer: true };

export default async function HeaderReviewPage({ searchParams }: { searchParams: Promise<{ frame?: string; width?: string; module?: string; role?: string }> }) {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const industryModule = query.module === "spa" ? "spa" : query.module === "steamfoot" ? "steamfoot" : "course";
  const admin = query.role !== "owner";
  const widths = [360, 390, 768, 1024, 1366, 1920];
  const width = widths.find(value => String(value) === query.width) ?? 390;
  const params = new URLSearchParams({ module: industryModule, role: admin ? "admin" : "owner" });
  if (query.frame === "1") return <DashboardShell industryModule={industryModule} industryModuleId={industryModule} isOwner permissions={[]} pricingPlan="EXPERIENCE" userName="RWD 驗收使用者" roleLabel={admin ? "系統管理者" : "店長"} logoutButton={null} trialStatus={industryModule === "course" ? trial : undefined} storeName="驗收店家" storeOptions={admin ? [{ id: "rwd-fixture", name: "RWD 驗收店家" }] : undefined}>
    <p>純介面驗收：使用共用後台外框與虛擬資料，無儲存操作。請勿使用導覽連結切換實際後台。</p>
  </DashboardShell>;
  return <main className="p-4">
    <h1 className="text-xl font-bold">共用後台頂部驗收 · {industryModule} · {admin ? "HQ" : "店長"}</h1>
    <p>虛擬資料；體驗版用量提醒使用較長文字。</p>
    <nav className="my-3 flex flex-wrap gap-3">{widths.map(value => <a key={value} href={`?width=${value}&${params}`}>{value}px</a>)}</nav>
    <div className="overflow-x-auto"><iframe title="後台頂部驗收" src={`?frame=1&${params}`} style={{ width, height: 900 }} className="box-content border border-earth-300" /></div>
  </main>;
}
