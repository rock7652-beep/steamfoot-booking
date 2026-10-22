import {toLocalMonthStr} from "@/lib/date-utils";
import { BeautyPortal } from "@/components/beauty/portal";
import { beautyPortal } from "@/server/beauty/queries";
import { BeautyClosedNotice } from "@/components/beauty/closed-notice";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ work?: string;month?:string;view?:string }>;
}) {
  if (process.env.BEAUTY_MODULE_ENABLED !== "1") return <BeautyClosedNotice />;
  const q = await searchParams;
  const data=await beautyPortal(q.work === "1",q.month??toLocalMonthStr());
  return <BeautyPortal key={q.work === "1" ? "work" : "member"} initialView={q.view} data={data} />;
}
