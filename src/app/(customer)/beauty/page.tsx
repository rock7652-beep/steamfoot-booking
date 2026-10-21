import { BeautyPortal } from "@/components/beauty/portal";
import { beautyPortal } from "@/server/beauty/queries";
import { BeautyClosedNotice } from "@/components/beauty/closed-notice";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ work?: string }>;
}) {
  if (process.env.BEAUTY_MODULE_ENABLED !== "1") return <BeautyClosedNotice />;
  const q = await searchParams;
  return <BeautyPortal key={q.work === "1" ? "work" : "member"} data={await beautyPortal(q.work === "1")} />;
}
