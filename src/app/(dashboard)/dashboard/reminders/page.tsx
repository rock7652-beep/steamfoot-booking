import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { isStoreFeatureEnabledForRead as hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { FeatureGate } from "@/components/feature-gate";
import { getActiveStoreForRead } from "@/lib/store";
import { redirect } from "next/navigation";
import { PageShell, PageHeader } from "@/components/desktop";
import { readSteamReminderPanel } from "@/server/queries/reminder-panel";
import { ReminderPanelReader } from "./reminder-panel-reader";
interface PageProps { searchParams: Promise<Record<string, string | undefined>>; }
export default async function RemindersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (
    !user ||
    !(await checkPermission(user.role, user.staffId, "business_hours.manage"))
  )
    redirect("/dashboard");
  const storeId = await getActiveStoreForRead(user);
  if (!storeId)
    return (
      <PageShell>
        <PageHeader title="提醒管理" />
        <p>請先切換至特定店舖。</p>
      </PageShell>
    );
  const [plan, enabled] = await Promise.all([
    getCurrentStorePlan(),
    hasStoreFeature(storeId, FEATURES.LINE_REMINDER),
  ]);
  if (!enabled)
    return (
      <FeatureGate plan={plan} feature={FEATURES.LINE_REMINDER} enabled={false}>
        {null}
      </FeatureGate>
    );
  return <ReminderPanelReader initial={await readSteamReminderPanel(params, storeId)} />;
}
