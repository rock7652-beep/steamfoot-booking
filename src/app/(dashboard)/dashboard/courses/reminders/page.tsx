import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { courseManager } from "@/server/services/course-access";
import { readCourseReminderPanel } from "@/server/queries/reminder-panel";
import { ReminderPanelReader } from "../../reminders/reminder-panel-reader";
export default async function CourseRemindersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || !await checkPermission(user.role, user.staffId, "business_hours.manage")) notFound();
  const { storeId } = await courseManager("business_hours.manage");

  return <ReminderPanelReader initial={await readCourseReminderPanel(await searchParams, storeId)} />;
}
