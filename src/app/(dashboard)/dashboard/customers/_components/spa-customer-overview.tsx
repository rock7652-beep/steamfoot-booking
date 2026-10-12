"use client";
import { useState } from "react";
import { EditCustomerForm } from "../[id]/edit/edit-customer-form";
import { CustomerPanelAdvanced } from "./customer-panel-advanced";
import { ExclusiveMenu } from "@/components/admin/exclusive-menu";
import { toLocalDateStr } from "@/lib/date-utils";
import { CustomerDetailFields } from "@/components/customer-detail-fields";
import { CustomerLabels } from "@/components/customer-labels";
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
  canReadAccounts = false,
  allowNavigation = () => true,
  onAccount,
  onSaved,
}: {
  customer: SpaCustomerSummary;
  profile: SpaCustomerProfile;
  canEdit: boolean;
  canBook: boolean;
  canReadBookings: boolean;
  canManageStaff: boolean;
  canReadAccounts?: boolean;
  allowNavigation?: () => boolean;
  onAccount?: () => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const details = profile.customer;
  if (editing) return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
    <EditCustomerForm isSpa customer={{ id: details.id, updatedAt: details.updatedAt?.toISOString(), name: details.name, phone: details.phone ?? "", email: details.email ?? "", gender: details.gender ?? "", birthday: details.birthday ? toLocalDateStr(details.birthday) : "", height: details.height ?? null, lineName: details.lineName ?? "", serviceNote: details.serviceNote ?? "" }} onSuccess={() => { setEditing(false); onSaved(); }} onCancel={() => { if (allowNavigation()) setEditing(false); }}/>
  </div>;
  return <div className="flex h-full min-h-0 flex-col">
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
      <CustomerLabels maxVisible={5} customerId={customer.id} readOnly={!canEdit}/>
      <RetainedNoteEditor quiet optimistic key={`note-${customer.id}`} stateKey={`customer-note:${customer.id}`} title="店內備註" hint=""
        placeholder="輸入服務偏好與注意事項" maxLength={2000}
        value={details.serviceNote} canEdit={canEdit}
        save={(serviceNote, previousNote) => saveSpaCustomerNote({ customerId: customer.id, serviceNote: serviceNote ?? "", previousNote })}
        onSaved={onSaved}/>
      {canReadAccounts && <section aria-label="有效方案與儲值" className="border-t border-earth-100 pt-2 text-sm">
        <div className="flex min-h-11 items-center justify-between gap-3"><h3 className="font-semibold">方案與儲值</h3>{onAccount && <button type="button" className="min-h-11 px-3 text-primary-700" onClick={onAccount}>查看／購買</button>}</div>
        {customer.balance != null && <p className="py-2">儲值餘額 <strong>NT$ {customer.balance.toLocaleString("zh-TW")}</strong></p>}
        {customer.packages.map((plan, index) => <div key={`${plan.name}-${index}`} className="flex flex-wrap justify-between gap-2 border-b border-earth-100 py-2"><span className="min-w-0 break-words font-medium">{plan.name}</span><span>可預約 {plan.available} 次{plan.expiry && ` · ${plan.expiry} 到期`}</span></div>)}
        {!customer.packages.length && <p className="py-2 text-earth-500">尚無有效方案</p>}
      </section>}
      {canReadBookings && <section aria-label="來店與預約" className="border-t border-earth-100 pt-2">
        <CustomerDetailFields items={[{label:"下次預約",value:customer.nextVisit},{label:"最近來店",value:customer.lastVisit}]}/>
        {canBook && <DashboardLink href={`/dashboard/spa-schedule?customerId=${encodeURIComponent(customer.id)}&new=1`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-primary-700">為這位顧客預約</DashboardLink>}
      </section>}
      <CustomerPanelAdvanced key={`line-${customer.id}`} managerSimple active customerId={customer.id} readOnly={!canEdit} canEdit={canEdit} onMutated={onSaved}/>
      <section className="border-t border-earth-100 pt-2">
        <div className="flex min-h-11 items-center justify-between gap-3"><h3 className="text-sm font-semibold">基本資料</h3>{canEdit && <button type="button" className="min-h-11 px-3 text-sm text-primary-700" onClick={() => { if (allowNavigation()) setEditing(true); }}>編輯基本資料</button>}</div>
        <CustomerDetailFields items={[{label:"電子信箱",value:details.email},{label:"生日",value:details.birthday ? toLocalDateStr(details.birthday) : ""},{label:"性別",value:({male:"男",female:"女",other:"其他"} as Record<string,string>)[details.gender ?? ""]}].filter(item => item.value != null && item.value !== "")}/>
      </section>
      {canManageStaff && <ExclusiveMenu quiet triggerText="更多" label="顧客其他操作"><AddSpaStaffButton customerId={customer.id}/></ExclusiveMenu>}
    </div>
  </div>;
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
