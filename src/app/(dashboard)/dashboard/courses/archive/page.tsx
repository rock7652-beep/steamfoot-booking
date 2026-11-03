import { notFound } from "next/navigation";
import { courseManagerRead } from "@/server/services/course-access";
import { checkPermission } from "@/lib/permissions";
import { musicRetirementEnabled, musicRetirementManifest } from "@/lib/music-retirement";
import { prisma } from "@/lib/db";
import { PageHeader, PageShell } from "@/components/desktop";
import { DashboardLink } from "@/components/dashboard-link";

const labels:Record<string,string>={Customer:"學員",Staff:"專用測試教師",CourseSession:"課次",CourseBooking:"預約／點名",CoursePointCard:"持有方案",CourseCardMember:"持卡成員",CoursePointEntry:"堂數流水",CoursePurchase:"購課原單",CourseMusicTuition:"分次學費",CourseMusicReceipt:"收款",CoursePurchaseRefund:"退款",CashbookEntry:"現金帳／沖銷",AuditLog:"稽核紀錄",CourseCompensationSnapshot:"計薪快照",CourseMusicOpeningState:"期初堂數狀態",CourseMusicOpeningMakeupEntitlement:"期初補課權益",CoursePointPlan:"專用收費方式",CourseTemplate:"專用課程設定",CourseRoom:"專用測試教室",MusicSourceImportBatch:"原始來源封存"};
export default async function MusicArchivePage({searchParams}:{searchParams:Promise<{group?:string;kind?:string;page?:string}>}) {
  const { user, storeId } = await courseManagerRead("report.read");
  if (!musicRetirementEnabled() || storeId !== musicRetirementManifest.storeId ||
    !await checkPermission(user.role, user.staffId, "cashbook.read") ||
    !await checkPermission(user.role, user.staffId, "customer.read")) notFound();
  const rows = await prisma.$queryRaw<Array<{groupKey:string;entityType:string;count:number}>>`
    SELECT "groupKey","entityType",count(*)::int count FROM "MusicOperationalArchive"
    WHERE "storeId"=${storeId} AND "batchId"=${musicRetirementManifest.batchId}
    GROUP BY "groupKey","entityType" ORDER BY "groupKey","entityType"`;
  const cash = await prisma.$queryRaw<Array<{income:number;expense:number}>>`
    SELECT COALESCE(sum((payload->>'amount')::numeric) FILTER(WHERE payload->>'type'='INCOME'),0)::float8 income,
    COALESCE(sum((payload->>'amount')::numeric) FILTER(WHERE payload->>'type'<>'INCOME'),0)::float8 expense
    FROM "MusicOperationalArchive" WHERE "storeId"=${storeId} AND "batchId"=${musicRetirementManifest.batchId} AND "entityType"='CashbookEntry'`;
  const students = await prisma.$queryRaw<Array<{groupKey:string;name:string}>>`
    SELECT "groupKey",payload->>'name' name FROM "MusicOperationalArchive"
    WHERE "storeId"=${storeId} AND "batchId"=${musicRetirementManifest.batchId} AND "entityType"='Customer'
    ORDER BY "groupKey","rowKey"`;
  const query=await searchParams;
  const group=query.group==="B"?"B":"A";
  const kind=rows.some(r=>r.groupKey===group&&r.entityType===query.kind)?query.kind:undefined;
  const count=rows.find(r=>r.groupKey===group&&r.entityType===kind)?.count??0;
  const requested=Number(query.page);
  const page=Math.max(1,Math.min(Math.ceil(count/20)||1,Number.isSafeInteger(requested)?requested:1));
  const records=kind?await prisma.$queryRaw<Array<{rowKey:string;payload:unknown}>>`
    SELECT "rowKey",payload FROM "MusicOperationalArchive"
    WHERE "storeId"=${storeId} AND "batchId"=${musicRetirementManifest.batchId} AND "groupKey"=${group} AND "entityType"=${kind}
    ORDER BY "rowKey" LIMIT 20 OFFSET ${(page-1)*20}`:[];
  return <PageShell compact><PageHeader title="營運封存紀錄" subtitle="2026/10/23 核准的 A、B 組；僅供查閱" actions={<DashboardLink href="/dashboard/courses">返回課表</DashboardLink>}/>
    <p className="text-sm text-earth-600">已退出日常營運、課表占用與計薪。原始紀錄、堂數流水、收款退款及稽核完整保留；未補登出勤，也未新增退款或沖銷。</p>
    <p className="my-3 text-sm">封存帳務：收入 NT$ {cash[0].income.toLocaleString()} · 支出 NT$ {cash[0].expense.toLocaleString()} · 淨額 NT$ {(cash[0].income-cash[0].expense).toLocaleString()}</p>
    <div className="grid min-w-0 gap-4 md:grid-cols-2">{["A","B"].map(group=><section key={group} className="min-w-0 rounded-xl border border-earth-200 bg-white p-4"><h2 className="font-semibold">{group} 組</h2><p className="my-2 break-words text-sm">{students.filter(s=>s.groupKey===group).map(s=>s.name).join("、")}</p><details><summary className="min-h-11 cursor-pointer py-3">封存項目與筆數</summary><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-2">項目</th><th>筆數</th></tr></thead><tbody>{rows.filter(r=>r.groupKey===group).map(row=><tr key={row.entityType} className="border-t border-earth-100"><td className="py-2"><DashboardLink className="inline-flex min-h-11 items-center underline" href={`/dashboard/courses/archive?group=${group}&kind=${row.entityType}`}>{labels[row.entityType]??"封存紀錄"}</DashboardLink></td><td>{row.count}</td></tr>)}</tbody></table></div></details></section>)}</div>
    {kind&&<section className="mt-4 min-w-0 rounded-xl border border-earth-200 bg-white p-4"><h2 className="font-semibold">{group} 組 · {labels[kind]??"封存紀錄"}（{count} 筆）</h2><p className="my-2 text-sm text-earth-600">點選紀錄查閱原始欄位與關聯；此處沒有修改或刪除操作。</p>{records.map(row=><details key={row.rowKey} className="min-w-0 border-t border-earth-100"><summary className="min-h-11 cursor-pointer break-all py-3 text-sm">{row.rowKey}</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-earth-50 p-3 text-sm">{JSON.stringify(row.payload,null,2)}</pre></details>)}<div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><span>第 {page}／{Math.ceil(count/20)||1} 頁</span>{page>1&&<DashboardLink className="inline-flex min-h-11 items-center underline" href={`/dashboard/courses/archive?group=${group}&kind=${kind}&page=${page-1}`}>上一頁</DashboardLink>}{page*20<count&&<DashboardLink className="inline-flex min-h-11 items-center underline" href={`/dashboard/courses/archive?group=${group}&kind=${kind}&page=${page+1}`}>下一頁</DashboardLink>}</div></section>}
    <p className="mt-4 text-sm text-earth-600">C 組、四位啟用教師、共用教室與教學項目、10/23 新版流程驗收資料均保留。</p>
  </PageShell>;
}
