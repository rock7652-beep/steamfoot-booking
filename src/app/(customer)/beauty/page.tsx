import {toLocalMonthStr,parseTaipeiDateTime} from "@/lib/date-utils";
import { BeautyPortal } from "@/components/beauty/portal";
import { beautyPortal } from "@/server/beauty/queries";
import { BeautyClosedNotice } from "@/components/beauty/closed-notice";
import { beautyMemberPurchaseIntentsEnabled } from "@/server/beauty/member-purchase-intent";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ work?: string;month?:string;view?:string;date?:string }>;
}) {
  if (process.env.BEAUTY_MODULE_ENABLED !== "1") return <BeautyClosedNotice />;
  const q = await searchParams;
  const date=q.date&&/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(q.date)&&parseTaipeiDateTime(q.date,'00:00')?q.date:undefined;
  const data=await beautyPortal(q.work === "1",date?.slice(0,7)??q.month??toLocalMonthStr());
  return <BeautyPortal key={data.store.id+":"+data.scopeKey} initialView={q.view} initialDate={date} data={data} memberPurchaseRecoveryEnabled={beautyMemberPurchaseIntentsEnabled()} />;
}
