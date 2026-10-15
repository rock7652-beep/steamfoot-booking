import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { PageShell,PageHeader } from "@/components/desktop";
import { DashboardLink } from "@/components/dashboard-link";
import { readMusicPilotSalary } from "@/server/queries/music-pilot-salary";
import { SalaryPreview } from "./salary-preview";
export default async function SalaryPilotPage(){
  const user=await getCurrentUser();
  if(!user||!await checkPermission(user.role,user.staffId,"staff.view")||!await checkPermission(user.role,user.staffId,"teacher.settlement.read"))notFound();
  const report=await readMusicPilotSalary();
  return <PageShell className="min-w-0 w-full"><PageHeader title="十人樣本・鐘點與薪資測試" subtitle="音教雲費率及店主確認規則已銜接" actions={<DashboardLink className="inline-flex min-h-11 items-center" href="/dashboard/courses/source-pilot">返回學生核對</DashboardLink>}/>
    <p className="text-sm text-gray-600">按原價拆帳，免費體驗照常計酬。學生請假原日 0 元，實際補課才計一次；曠課扣堂計酬，老師請假／曠課 0 元。團班僅包含已匯入學員，這是樣本部分鐘點。</p>
    <p className="rounded border p-3 text-sm">黃子齊原待補課：800 × {report.oldMakeupPercent}%＝{report.oldMakeupPrice*report.oldMakeupPercent/100} 元，實際補課出席後計酬。舊薪資不重新入帳。</p>
    <SalaryPreview rows={report.rows}/>
  </PageShell>;
}
