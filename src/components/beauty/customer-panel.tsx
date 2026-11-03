"use client";
import {CourseCustomerAttribution} from "@/app/(dashboard)/dashboard/courses/customer-attribution";
import {saveBeautyCustomerAttribution,searchBeautyReferrerCandidates} from "@/server/actions/beauty-customer-attribution";
import {CourseCustomerDraftForm} from "@/app/(dashboard)/dashboard/courses/course-profile-forms";
import {saveBeautyCustomerProfile} from "@/server/actions/beauty";
import {CourseCustomerOverview} from "@/app/(dashboard)/dashboard/courses/customer-overview";
import {RetainedNoteEditor} from "@/components/operations/retained-note-editor";
import {BeautySharedMembers} from "./shared-members";
import {StoreMemberConnectionPanel} from "@/components/admin/store-member-connection-panel";
import {useCustomerPanelGuard} from "@/components/admin/use-customer-panel-guard";
import {SettingsPanelContext} from "@/components/admin/settings-panel-context";
import {CustomerPanelTabs} from "@/components/admin/customer-panel-tabs";
import {CustomerDetailFields} from "@/components/customer-detail-fields";
import {DataTable} from "@/components/desktop";
import { useEffect, useRef, useState, useTransition } from "react";
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
  const support=useCustomerPanelGuard();
  const [editingAttribution,setEditingAttribution]=useState(false);
  const [recordTab,setRecordTab]=useState("bookings");
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
  const readScope=useRef({id,active:false});
  useEffect(() => {
    const scope={id,active:true};readScope.current=scope;
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
      active = false;scope.active=false;
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
  const [profilePending,setPendingProfile]=useState(false);
  const [dirty,setDirty]=useState(false),[tab,setTab]=useState("info"),[editing,setEditing]=useState(false);
  const close=()=>{if(!pending&&!profilePending&&support.allowLeave()&&(!dirty||window.confirm('尚有未儲存的顧客資料，確定離開？')))onClose();};
  const customer = detail?.success ? detail.data.customer : null;
  return (
    <SettingsPanelContext.Provider value={support.context}><RightSheet
      open
      className="fitness-management-editor"
      presentation="centered"
      width={850}
      onClose={close}
      closeOnEscape={!pending&&!profilePending}
      labelledById="beauty-customer-detail"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-earth-100 bg-primary-50/60 px-4 py-2">
        <h2 id="beauty-customer-detail" className="min-w-0 break-words text-base font-semibold text-primary-900">{customer?.name??'顧客資料與服務紀錄'}</h2>
        <div className="flex items-center gap-2">{customer&&tab==='info'&&!readOnly&&data.manage.customerEdit&&<button className="min-h-11 rounded-lg px-3 text-sm font-medium text-primary-700 hover:bg-primary-100" onClick={()=>{if(!pending&&!profilePending&&support.allowLeave()&&(!dirty||window.confirm('尚未儲存，確定切換？'))){setDirty(false);setEditing(!editing);}}}>{editing?'返回顧客概況':'編輯顧客資料'}</button>}<button className={field+' !w-auto'} disabled={pending||profilePending} onClick={close}>關閉</button></div>
      </header>
      <CustomerPanelTabs items={[{id:'info',label:'顧客概況'},{id:'records',label:'紀錄'}]} value={tab} onSelect={value=>{if(!pending&&!profilePending&&support.allowLeave()&&(!dirty||window.confirm('尚未儲存，確定切換？'))){setDirty(false);setEditing(false);setTab(value);}}}/>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4" onChangeCapture={e=>{if((e.target as HTMLElement).matches('[name]')&&(e.target as HTMLElement).closest('form[data-beauty-draft]'))setDirty(true);}}>
        {!detail && !error && <p role="status">讀取中…</p>}
        {detail && !detail.success && <p role="alert">{detail.error}</p>}
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        {customer&&tab==='info'&&!editing&&<CourseCustomerOverview id={id} phone={customer.phone} canEdit={!readOnly&&data.manage.customerEdit} compact attribution={<CourseCustomerAttribution compact customerId={id} currentStaff={data.customers.find(c=>c.id===id)?.assignedStaff??null} currentSponsor={data.customers.find(c=>c.id===id)?.sponsor??null} staffOptions={data.assignmentStaff} canAssign={!readOnly&&!!data.manage.customerAssign} editing={editingAttribution} onToggle={()=>{if(support.allowLeave())setEditingAttribution(v=>!v);}} saveAction={saveBeautyCustomerAttribution} searchAction={searchBeautyReferrerCandidates} onSaved={()=>{setEditingAttribution(false);router.refresh();}}/>} details={<CustomerDetailFields items={[{label:'電子信箱',value:customer.email},{label:'生日',value:customer.birthday},{label:'性別',value:({male:'男',female:'女',other:'其他'} as Record<string,string>)[customer.gender??'']},{label:'地址',value:customer.address,full:true},{label:'緊急聯絡人',value:customer.emergencyContactName},{label:'緊急聯絡電話',value:customer.emergencyContactPhone}]}/>} note={<RetainedNoteEditor quiet optimistic stateKey={`beauty-customer-note:${data.storeId}:${id}`} title="顧客備註" hint="" placeholder="輸入顧客備註" maxLength={1000} value={customer.notes} canEdit={!readOnly&&data.manage.customerEdit} save={async(notes,expectedNotes)=>{const r=await updateBeautyCustomer({id,expected:{name:customer.name,phone:customer.phone,notes:expectedNotes??''},values:{name:customer.name,phone:customer.phone,notes:notes??''}});return r;}} onSaved={()=>{reader.invalidate(id);const scope=readScope.current;void reader.load(id,{revalidate:true}).then(r=>{if(scope.active&&scope.id===id)setDetail(r);}).catch(()=>{if(scope.active&&scope.id===id)setError("備註已儲存，顧客資料重新載入失敗，請重新開啟核對");});router.refresh();}}/>} connection={!readOnly&&data.manage.customerEdit?<StoreMemberConnectionPanel compact customerId={id}/>:<p className="text-sm">會員身分：{data.customers.find(c=>c.id===id)?.userId?'已連結':'尚未連結'}</p>} cards={<section className="border-t border-earth-100 pt-2"><h3 className="py-2 text-sm font-semibold">持有方案</h3><DataTable rows={data.cards.filter(c=>c.memberIds.includes(id))} rowKey={c=>c.id} columns={[{key:'name',header:'方案',accessor:c=>c.name},{key:'balance',header:'可用次數',accessor:c=>!c.closedAt&&Date.parse(c.expiresAt)>data.now?Math.max(0,c.remaining-c.held)+' 次':'已結清／到期'},{key:'held',header:'已預約',accessor:c=>c.held+' 次'},{key:'expiry',header:'到期',accessor:c=>formatTWDateTime(new Date(c.expiresAt))}]}/></section>}/>}
        {customer&&tab==='info'&&editing&&<><CourseCustomerDraftForm person={customer} canEdit={!readOnly&&data.manage.customerEdit} canCreate={false} hidden={false} save={saveBeautyCustomerProfile} draftScope={`beauty-customer:${data.storeId}`} onPending={setPendingProfile} onDirtyChange={setDirty} onSaved={()=>{reader.invalidate(id);router.refresh();onClose();}}/><div className="flex justify-end"><button type="submit" form="course-member-form" className={field+' !w-auto'} disabled={profilePending||readOnly||!data.manage.customerEdit}>儲存顧客資料</button></div></>}
        {tab==='info'&&!editing&&data.cards
          .filter((c) => c.customerId === id && c.allowShared && !c.closedAt)
          .map((c) => (
            <form
              data-beauty-draft
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
              <BeautySharedMembers title={c.name+" · 共用設定"} customers={data.customers} ownerId={c.customerId} memberIds={c.memberIds} disabled={pending||readOnly||!data.manage.members}>{!readOnly&&data.manage.members&&<button className={field+' mt-2'} disabled={pending}>儲存共用成員</button>}</BeautySharedMembers>
            </form>
          ))}
        {tab==='records'&&detail?.success && (
          <section>
            <nav className="flex gap-2" aria-label="紀錄種類"><button className="min-h-11 px-3 text-sm" aria-pressed={recordTab==='bookings'} onClick={()=>setRecordTab('bookings')}>服務紀錄</button>{detail.data.canTransactions&&<button className="min-h-11 px-3 text-sm" aria-pressed={recordTab==='purchases'} onClick={()=>setRecordTab('purchases')}>交易紀錄</button>}</nav>
            {recordTab==='purchases'&&detail.data.canTransactions?<DataTable rows={detail.data.payments} rowKey={p=>p.id} columns={[{key:'date',header:'入帳日期',accessor:p=>formatTWDateTime(new Date(p.createdAt))},{key:'kind',header:'類型',accessor:p=>p.kind==='SALE'?'收款':'退款'},{key:'amount',header:'金額',accessor:p=>p.amount.toLocaleString('zh-TW')},{key:'method',header:'付款方式',accessor:p=>({CASH:'現金',BANK_TRANSFER:'轉帳',CARD:'刷卡',OTHER:'其他'} as Record<string,string>)[p.method]??p.method},{key:'note',header:'備註',accessor:p=>p.note}]}/>:null}
            {recordTab==='bookings'&&<><h3>最近200筆服務紀錄</h3>
            {!detail.data.items.length && <p>尚無連結會員身分的服務紀錄。</p>}
            <DataTable rows={detail.data.items} rowKey={b=>b.id} columns={[{key:'date',header:'服務日期',accessor:b=>formatTWDateTime(new Date(b.startsAt))},{key:'service',header:'服務項目',accessor:b=>b.serviceName},{key:'status',header:'狀態',accessor:b=>({RESERVED:'預約',COMPLETED:'完成',CANCELLED:'取消',NO_SHOW:'未到'} as Record<string,string>)[b.status]??b.status},{key:'notes',header:'備註',accessor:b=>b.notes}]}/></>}
          </section>
        )}
      </div>
    </RightSheet></SettingsPanelContext.Provider>
  );
}
