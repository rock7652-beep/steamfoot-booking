import { notFound } from "next/navigation";
import { BeautyPublicBookingPreview } from "@/components/beauty/public-booking-preview";
import "@/app/(customer)/book/course-portal.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "公開體驗預約｜隔離預覽", robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "codex/beauty-public-booking-ux" ||
    process.env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" || process.env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking") notFound();
  return <BeautyPublicBookingPreview/>;
}
