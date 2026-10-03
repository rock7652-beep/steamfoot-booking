"use client";
import Link from "next/link";
import { FEATURES } from "@/lib/feature-flags";
import { useFeaturePresentation } from "@/components/feature-presentation";

export function FrontendPreviewQuickLink({ storeId, personId, role = "member" }: { storeId: string; personId: string; role?: "member" | "work" }) {
  const state = useFeaturePresentation(FEATURES.FRONTEND_PREVIEW);
  if (state !== "ENABLED") return null;
  return <Link prefetch={false} href={`/dashboard/frontend-preview?${new URLSearchParams({ storeId, personId, role })}`} className="inline-flex min-h-11 items-center rounded-lg border border-earth-200 bg-white px-3 text-sm font-medium text-primary-700">{role === "work" ? "查看我的工作" : "查看會員前台"}</Link>;
}
