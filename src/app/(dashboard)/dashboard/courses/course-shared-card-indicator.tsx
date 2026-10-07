"use client";

/** Opens the existing detail panel, so the compact label works on touch and keyboard. */
export function CourseSharedCardIndicator({ name, onOpen }: { name: string; onOpen: () => void }) {
  return <button
    type="button"
    aria-haspopup="dialog"
    aria-label={`${name}：允許共卡，查看詳情`}
    className="min-h-11 min-w-11 shrink-0 px-1 text-sm text-earth-600 underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary-600"
    onClick={onOpen}
  >共卡</button>;
}

/** Card authorization and who booked are distinct; one trigger keeps the roster dense.
 * The 24px flow box retains the name line; vertical-only hit slop reaches 44px
 * inside the existing roster row without growing it or covering adjacent columns.
 */
export function CourseBookingContextIndicator({ name, shared, proxy, onOpen }: {
  name: string; shared: boolean; proxy: boolean; onOpen: () => void;
}) {
  if (!shared && !proxy) return null;
  const label = shared && proxy ? "共卡・代約" : shared ? "共卡" : "代約";
  return <button type="button" aria-haspopup="dialog" aria-label={`${name}：${label}，查看預約詳情`}
    className="relative z-20 inline-flex h-6 min-w-11 shrink-0 after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-[''] items-center justify-center whitespace-nowrap px-1 text-sm font-normal text-earth-600 underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary-600"
    onClick={onOpen}>{label}</button>;
}
