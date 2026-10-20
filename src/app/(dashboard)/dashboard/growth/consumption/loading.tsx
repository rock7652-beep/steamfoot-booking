import { PageHeader, PageShell } from "@/components/desktop";

export default function Loading() {
  return <PageShell compact><PageHeader title="期間消耗統計" /><p role="status" className="p-4 text-earth-600">正在讀取消耗統計…</p></PageShell>;
}
