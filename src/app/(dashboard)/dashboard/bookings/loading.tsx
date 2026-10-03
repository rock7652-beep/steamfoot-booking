import { PageShell, PageHeader } from "@/components/desktop";
import { BookingWorkspaceLoading } from "./booking-workspace-loading";

export default function Loading() {
  return (
    <PageShell>
      <PageHeader title="預約管理" />
      <BookingWorkspaceLoading />
    </PageShell>
  );
}
