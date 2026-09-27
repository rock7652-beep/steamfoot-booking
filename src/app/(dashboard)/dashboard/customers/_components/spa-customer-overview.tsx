"use client";
import { RetainedNoteEditor } from "@/components/operations/retained-note-editor";
import { DashboardLink } from "@/components/dashboard-link";
import {
  saveSpaCustomerNote,
  getSpaCustomerProfile,
} from "@/server/actions/spa-customer-profile";
import type { SpaCustomerSummary } from "@/server/queries/spa-customer-summary";
import { AddSpaStaffButton } from "./add-spa-staff-button";
export type SpaCustomerProfile = Extract<
  Awaited<ReturnType<typeof getSpaCustomerProfile>>,
  { success: true }
>;
export function SpaCustomerOverview({
  customer,
  profile,
  canEdit,
  canBook,
  canReadBookings,
  canManageStaff,
  onSaved,
}: {
  customer: SpaCustomerSummary;
  profile: SpaCustomerProfile;
  canEdit: boolean;
  canBook: boolean;
  canReadBookings: boolean;
  canManageStaff: boolean;
  onSaved: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
        <div className="space-y-3">
          {canEdit && (
            <DashboardLink
              href={`/dashboard/customers/${encodeURIComponent(customer.id)}/edit`}
              className="inline-block py-2 text-sm text-[#596D45] underline"
            >
              編輯基本資料
            </DashboardLink>
          )}
          {canManageStaff && <AddSpaStaffButton customerId={customer.id} />}
          <section
            hidden={!canReadBookings}
            className="rounded-xl border border-earth-200 p-4"
          >
            <h3 className="font-bold">來店與預約</h3>
            <p className="mt-2 text-sm">
              最近來店：{customer.lastVisit ?? "尚無完成服務紀錄"}
            </p>
            <p className="mt-1 text-sm">
              下次預約：{customer.nextVisit ?? "尚未預約"}
            </p>
            {canBook && (
              <DashboardLink
                href={`/dashboard/spa-schedule?customerId=${encodeURIComponent(customer.id)}&new=1`}
                className="mt-4 inline-block rounded-lg bg-[#596D45] px-4 py-3 text-white"
              >
                ＋為這位顧客預約
              </DashboardLink>
            )}
          </section>
        </div>
        <RetainedNoteEditor key={customer.id} stateKey={`customer-note:${customer.id}`} title="服務偏好與注意事項"
          hint="僅供店內服務參考，例如力道偏好、指定人員或需留意事項。"
          placeholder="例如：喜歡輕力道，服務前先確認當天需求。" maxLength={2000}
          value={profile.customer.serviceNote} canEdit={canEdit}
          save={(serviceNote, previousNote) => saveSpaCustomerNote({ customerId: customer.id, serviceNote: serviceNote ?? "", previousNote })}
          onSaved={onSaved} />
      </div>
    </div>
  );
}
export function SpaServiceHistory({
  profile,
  dateFrom = "",
  dateTo = "",
  status = "",
}: {
  profile: SpaCustomerProfile | null;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}) {
  const bookings =
    profile?.bookings.filter(
      (b) =>
        (!dateFrom || b.date >= dateFrom) &&
        (!dateTo || b.date <= dateTo) &&
        (!status || b.status === status),
    ) ?? [];
  const labels: Record<string, string> = {
    PENDING: "待確認",
    CONFIRMED: "已預約",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
    NO_SHOW: "未到",
  };
  return (
    <section>
      <h3 className="mb-3 font-bold">服務紀錄（最近 100 筆）</h3>
      {profile ? (
        bookings.length ? (
          bookings.map((b) => (
            <details key={b.id} className="border-b border-earth-100 py-3">
              <summary className="cursor-pointer text-sm">
                {b.date} {b.startTime} · {b.service} ·{" "}
                {labels[b.status] ?? b.status}
              </summary>
              <p className="mt-2 text-sm text-earth-500">
                {b.startTime}–{b.endTime} · {b.staff}
              </p>
            </details>
          ))
        ) : (
          <p className="text-sm text-earth-500">沒有符合條件的服務紀錄</p>
        )
      ) : (
        <p role="status">讀取服務紀錄中…</p>
      )}
    </section>
  );
}
