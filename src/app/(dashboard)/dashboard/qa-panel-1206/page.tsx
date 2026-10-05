import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { PanelAcceptanceFrame } from "./preview-frame";

export default async function Page() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "qa/panel-1206-network-rwd-20261005") notFound();
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN" || !(await checkPermission(user.role, user.staffId, "customer.read"))) notFound();
  return <PanelAcceptanceFrame />;
}
