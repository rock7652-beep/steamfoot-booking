import { CourseSettingsEditor } from "./settings-editor";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { PageShell, PageHeader } from "@/components/desktop";

export type CourseHubView = "settings" | "operations";
export async function CourseSharedHub({view}:{view:CourseHubView}) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const permission = view === "operations" ? "cashbook.read" : "booking.read";
  if (!(await checkPermission(user.role, user.staffId, permission))) notFound();
  if (view === "settings" && !["ADMIN", "OWNER", "PARTNER"].includes(user.role))
    notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId || (await getStoreIndustryModule(storeId)) !== "course")
    notFound();
  if (view === "operations") redirect("/dashboard/revenue");
  const title = "設定";
  const subtitle = "店家基本資訊";
  let body: React.ReactNode;
  {
    const [store, rule, canEdit, config] = await Promise.all([
      prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true },
      }),
      coursePrisma.courseBookingRule.findUnique({ where: { storeId } }),
      checkPermission(user.role, user.staffId, "business_hours.manage"),
      prisma.shopConfig.findUnique({ where: { storeId }, select: { address: true, mapUrl: true, lineOfficialUrl: true, bankName: true, bankCode: true, bankAccountNumber: true } }),
    ]);
    body = (
      <CourseSettingsEditor
        name={store?.name ?? ""}
        bankName={config?.bankName??""} bankCode={config?.bankCode??""} bankAccountNumber={config?.bankAccountNumber??""}
        address={config?.address ?? ""} mapUrl={config?.mapUrl ?? ""} lineOfficialUrl={config?.lineOfficialUrl ?? ""}
        bookingLeadMinutes={rule?.bookingLeadMinutes ?? 0}
        cancellationLeadMinutes={rule?.cancellationLeadMinutes ?? 0}
        canEdit={canEdit}
      />
    );

  }
  return <PageShell className="course-workspace mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6"><PageHeader title={title} subtitle={subtitle}/><div className="space-y-5">{body}</div></PageShell>;
}
