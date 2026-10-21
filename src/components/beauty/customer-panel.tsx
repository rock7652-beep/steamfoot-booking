"use client";
import {CustomerPanelTabs} from "@/components/admin/customer-panel-tabs";
import {CustomerDetailFields,CustomerPhoneLink} from "@/components/customer-detail-fields";
import {DataTable} from "@/components/desktop";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { createClientReadCache } from "@/lib/client-read-cache";
import { formatTWDateTime } from "@/lib/date-utils";
import {
  readBeautyCustomer,
  updateBeautyCustomer,
  updateBeautyCardMembers,
} from "@/server/actions/beauty";
import type { BeautyDashboardData } from "@/server/beauty/queries";
const field =
  "min-h-11 w-full rounded-lg border border-earth-200 px-3 py-2 text-base";
export function BeautyCustomerPanel({
  id,
  data,
  readOnly,
  onClose,
}: {
  id: string;
  data: BeautyDashboardData;
  readOnly: boolean;
  onClose: () => void;
}) {
  const [reader] = useState(() =>
    createClientReadCache((id: string) => readBeautyCustomer({ id }), {
      ttlMs: 0,
      staleMs: 0,
    }),
  );
  const [detail, setDetail] = useState<Awaited<
      ReturnType<typeof readBeautyCustomer>
    > | null>(null),
    [error, setError] = useState(""),
    [pending, start] = useTransition(),
    router = useRouter();
  useEffect(() => {
    let active = true;
    reader
      .load(id, { revalidate: true })
      .then((r) => {
        if (active) setDetail(r);
      })
      .catch(() => {
        if (active) setError("讀取失敗，請關閉重試");
      });
    return () => {
      active = false;
    };
  }, [reader, id]);
  function run(
    work: () =>
      | ReturnType<typeof updateBeautyCardMembers>
      | ReturnType<typeof updateBeautyCustomer>,
  ) {
    start(async () => {
      try {
        const r = await work();
        if (!r.success) setError(r.error);
        else {
          reader.invalidate(id);
          router.refresh();
          onClose();
        }
      } catch {
        setError("連線失敗，請核對後重試");
      }
    });
  }
  const [dirty,setDirty]=useState(false),[tab,setTab]=useState("info"),[editing,setEditing]=useState(false);
  const close=()=>{if(!pending&&(!dirty||window.confirm('尚有未儲存的顧客資料，確定離開？')))onClose();};
  const customer = detail?.success ? detail.data.customer : null;
  return (
    <RightSheet
      open
      className="fitness-management-editor"
      presentation="centered"
      width={850}
      onClose={close}
      closeOnEscape={!pending}
      labelledById="beauty-customer-detail"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-earth-100 bg-primary-50/60 px-4 py-2">
        <h2 id="beauty-customer-detail" className="min-w-0 break-words text-base font-semibold text-primary-900">{customer?.name??'顧客資料與服務紀錄'}</h2>
        <div className="flex items-center gap-2">{customer&&tab==='info'&&!readOnly&&data.manage.customerEdit&&<button className="min-h-11 rounded-lg px-3 text-sm font-medium text-primary-700 hover:bg-primary-100" onClick={()=>{if(!dirty||window.confirm('尚未儲存，確定切換？')){setDirty(false);setEditing(!editing);}}}>{editing?'返回顧客概況':'編輯顧客資料'}</button>}<button className={field+' !w-auto'} disabled={pending} onClick={close}>關閉</button></div>
      </header>
      <CustomerPanelTabs items={[{id:'info',label:'顧客概況'},{id:'records',label:'紀錄'}]} value={tab} onSelect={value=>{if(!pending&&(!dirty||window.confirm('尚未儲存，確定切換？'))){setDirty(false);setEditing(false);setTab(value);}}}/>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4" onChangeCapture={()=>setDirty(true)}>
        {!detail && !error && <p role="status">讀取中…</p>}
        {detail && !detail.success && <p role="alert">{detail.error}</p>}
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        {customer&&tab==='info'&&!editing&&<section className="space-y-3"><CustomerPhoneLink phone={customer.phone}/><CustomerDetailFields items={[{label:'姓名',value:customer.name},{label:'店內備註',value:customer.notes,full:true}]}/><section className="border-t border-earth-100 pt-2"><h3 className="py-2 text-sm font-semibold">持有方案</h3><DataTable rows={data.cards.filter(c=>c.memberIds.includes(id))} rowKey={c=>c.id} columns={[{key:'name',header:'方案',accessor:c=>c.name},{key:'balance',header:'可用次數',accessor:c=>!c.closedAt&&Date.parse(c.expiresAt)>data.now?Math.max(0,c.remaining-c.held)+' 次':'已結清／到期'},{key:'held',header:'已預約',accessor:c=>c.held+' 次'},{key:'expiry',header:'到期',accessor:c=>formatTWDateTime(new Date(c.expiresAt))}]}/></section></section>}
        {customer && tab==='info' && editing && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(() =>
                updateBeautyCustomer({
                  id,
                  expected: customer,
                  values: {
                    name: f.get("name"),
                    phone: f.get("phone"),
                    notes: f.get("notes"),
                  },
                }),
              );
            }}
          >
            <fieldset
              className="grid gap-3 sm:grid-cols-2"
              disabled={pending || readOnly || !data.manage.customerEdit}
            >
              <label>
                姓名
                <input
                  className={field}
                  required
                  name="name"
                  defaultValue={customer.name}
                />
              </label>
              <label>
                手機
                <input
                  className={field}
                  required
                  pattern="09[0-9]{8}"
                  type="tel"
                  name="phone"
                  defaultValue={customer.phone}
                />
              </label>
              <label className="sm:col-span-2">
                顧客備註
                <textarea
                  className={field}
                  name="notes"
                  defaultValue={customer.notes}
                />
              </label>
              {!readOnly && data.manage.customerEdit && (
                <button className={field}>儲存顧客資料</button>
              )}
            </fieldset>
          </form>
        )}
        {tab==='info'&&!editing&&data.cards
          .filter((c) => c.customerId === id && c.allowShared && !c.closedAt)
          .map((c) => (
            <form
              className="space-y-2 border-t border-earth-100 py-2 text-sm"
              key={c.id}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(() =>
                  updateBeautyCardMembers({
                    id: c.id,
                    expected: c.memberIds,
                    memberIds: f.getAll("memberIds"),
                    requestKey: crypto.randomUUID(),
                  }),
                );
              }}
            >
              <h3>{c.name}｜具名共用成員</h3>
              <p>購買人保留在共用成員中；同用一份餘額。</p>
              <fieldset disabled={pending || readOnly || !data.manage.members}>
                {data.customers.map((p) => (
                  <label
                    className="flex min-h-11 items-center gap-2"
                    key={p.id}
                  >
                    <input
                      name="memberIds"
                      type="checkbox"
                      value={p.id}
                      defaultChecked={c.memberIds.includes(p.id)}
                    />
                    {p.name}
                  </label>
                ))}
                {!readOnly && data.manage.members && (
                  <button className={field}>儲存共用成員</button>
                )}
              </fieldset>
            </form>
          ))}
        {tab==='records'&&detail?.success && (
          <section>
            <h3>最近200筆服務紀錄</h3>
            {!detail.data.items.length && <p>尚無連結會員身分的服務紀錄。</p>}
            <DataTable rows={detail.data.items} rowKey={b=>b.id} columns={[{key:'date',header:'服務日期',accessor:b=>formatTWDateTime(new Date(b.startsAt))},{key:'service',header:'服務項目',accessor:b=>b.serviceName},{key:'status',header:'狀態',accessor:b=>({RESERVED:'預約',COMPLETED:'完成',CANCELLED:'取消',NO_SHOW:'未到'} as Record<string,string>)[b.status]??b.status},{key:'notes',header:'備註',accessor:b=>b.notes}]}/>
          </section>
        )}
      </div>
    </RightSheet>
  );
}
