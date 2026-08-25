import { PageShell } from "@/components/desktop";

export default function CustomerHealthLoading() {
  return (
    <PageShell>
      <div className="h-16 animate-pulse rounded-xl bg-earth-100" />
      <div className="h-96 animate-pulse rounded-2xl border border-earth-200 bg-white" />
    </PageShell>
  );
}
