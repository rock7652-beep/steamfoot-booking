import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/desktop";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { toLocalDateStr } from "@/lib/date-utils";
import { MusicTypesShowcase } from "./music-types-showcase";

export default async function MusicTypesShowcasePage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.read"))) redirect("/dashboard");
  const storeId = await getActiveStoreForRead(user);
  if (process.env.VERCEL_ENV !== "preview" || !storeId || (await getStoreIndustryModule(storeId)) !== "course") notFound();

  return (
    <PageShell className="course-workspace flex w-full min-w-0 max-w-none flex-col gap-2 px-3 py-2">
      <MusicTypesShowcase date={toLocalDateStr()} />
    </PageShell>
  );
}
