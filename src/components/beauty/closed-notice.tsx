import { EmptyState } from "@/components/ui/empty-state";

/** Expected module state; do not turn a closed module into an RSC exception. */
export function BeautyClosedNotice() {
  return (
    <section aria-label="美業開放狀態" className="mx-auto w-full max-w-3xl p-4">
      <EmptyState
        icon="lock"
        title="美業模組尚未開放"
        description="目前暫不接受美業預約，請聯繫店家確認開放時間。"
      />
    </section>
  );
}
