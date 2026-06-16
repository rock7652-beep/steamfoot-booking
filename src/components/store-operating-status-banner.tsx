import {
  getStoreUnavailableMessage,
  STORE_OPERATING_STATUS_LABELS,
  type StoreOperatingStatus,
} from "@/lib/store-operating-status";

export function StoreOperatingStatusBanner({
  status,
}: {
  status: StoreOperatingStatus;
}) {
  if (status === "TRIAL" || status === "ACTIVE") return null;

  const tone =
    status === "INACTIVE"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b px-4 py-2.5 text-[13px] leading-relaxed ${tone}`}
      role="status"
    >
      <span className="font-semibold">⚠ 店舖目前{STORE_OPERATING_STATUS_LABELS[status]}</span>
      <span className="font-normal opacity-90">
        {getStoreUnavailableMessage(status)} 店舖狀態由總部管理。
      </span>
    </div>
  );
}
