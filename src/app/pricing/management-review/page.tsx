import { notFound } from "next/navigation";
import DashboardShell from "@/components/sidebar";
import { ReviewViewport } from "../schedule-review/review-viewport";
import { ManagementReviewContent } from "./review-content";
import "../../spa-admin.css";

export const dynamic = "force-dynamic";
export const metadata = {title: "人員與分析 RWD 驗收", robots: {index: false, follow: false}};

export default async function ManagementReviewPage({searchParams}: {searchParams: Promise<{frame?: string; width?: string; variant?: string}>}) {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const variants = ["steamfoot", "spa", "fitness", "music", "analysis"];
  const variant = variants.includes(query.variant ?? "") ? query.variant! : "steamfoot";
  const width = [360, 390, 768, 1024, 1366, 1920].find(value => String(value) === query.width) ?? 390;
  if (query.frame === "1") return <DashboardShell industryModule={variant === "spa" ? "spa" : variant === "fitness" || variant === "music" ? "course" : "steamfoot"} isOwner operationGuidePreview permissions={["staff.view", "report.read"]} pricingPlan="EXPERIENCE" userName="RWD 驗收使用者" roleLabel="系統管理者" logoutButton={null} storeName="虛擬驗收店家">
    <p className="mb-3 text-sm text-earth-500">虛擬資料，只檢查排版與未儲存草稿；不送出儲存、搜尋會員或停用操作。</p>
    <ManagementReviewContent variant={variant} />
  </DashboardShell>;
  return <main className="p-4"><h1 className="text-xl font-bold">人員與分析 RWD 驗收 · {variant}</h1>
    <nav className="my-3 flex flex-wrap gap-3">{variants.map(value => <a key={value} href={`?variant=${value}&width=${width}`}>{value}</a>)}</nav>
    <ReviewViewport src={`?frame=1&variant=${variant}`} initialWidth={width} />
  </main>;
}
