"use client";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { useId, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { RightSheet } from "@/components/admin/right-sheet";
import { loadSteamBookingForm, submitSteamBookingForm } from "@/server/actions/steam-booking-form";
import { DashboardBookingForm } from "./new/booking-form";
import { CustomerAndPlanFields } from "./new/customer-and-plan-fields";
import { BookingCreateForm, BookingCreateSubmit, useBookingFormValidation } from "./new/booking-create-form";

const button="inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium";
type Data=Extract<Awaited<ReturnType<typeof loadSteamBookingForm>>,{success:true}>["data"];

export function SteamBookingDrawer({date,makeup=false,triggerLabel,onCreated,triggerClassName}:{date:string;makeup?:boolean;triggerLabel:string;onCreated?:()=>void;triggerClassName?:string}) {
  const formReader=usePanelReader("steam-booking-form",loadSteamBookingForm);
  const titleId=useId();
  const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const [data,setData]=useState<Data|null>(null);
  const dirty=useRef(false),pending=useRef(false),generation=useRef(0);
  const created=useRef(false);
  useEffect(()=>{if(!open&&created.current){created.current=false;if(onCreated)onCreated();else window.dispatchEvent(new Event("booking:created"));}},[open,onCreated]);
  function close(){if(pending.current)return;if(dirty.current&&!window.confirm("尚有未儲存的預約資料，要捨棄嗎？"))return;generation.current++;setOpen(false);}
  async function show(){
    const request=++generation.current;dirty.current=false;setData(null);setError("");setOpen(true);setLoading(true);
    try {const result=await formReader.read(date);if(request!==generation.current)return;if(result.success)setData(result.data);else setError(result.error);}
    catch {if(request===generation.current)setError("載入失敗，請重試");}
    finally {if(request===generation.current)setLoading(false);}
  }
  useEffect(()=>()=>{generation.current++;},[]);
  async function submit(form:FormData){
    pending.current=true;
    try {const result=await submitSteamBookingForm(form);if(!result.success)return {error:result.error??"建立失敗"};formReader.invalidate(date);dirty.current=false;created.current=true;setOpen(false);toast.success("已建立預約");}
    finally {pending.current=false;}
  }
  return <>
    <button type="button" className={triggerClassName??`${button} ${makeup?"border-earth-300 bg-white text-earth-700 hover:bg-earth-50":"border-primary-600 bg-primary-600 text-white hover:bg-primary-700"}`} onPointerEnter={()=>formReader.prefetch(date)} onFocus={()=>formReader.prefetch(date)} onTouchStart={()=>formReader.prefetch(date)} onClick={()=>void show()}>{triggerLabel}</button>
    {open&&createPortal(<RightSheet className="!z-[90]" compact open={open} onClose={close} width={860} labelledById={titleId}>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-earth-100 px-5 py-4"><h2 id={titleId} className="font-semibold text-primary-900">{makeup?"新增補課":"新增預約"}</h2><button type="button" aria-label="關閉新增預約" className="min-h-11 min-w-11 text-earth-500" onClick={close}>✕</button></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5" onChangeCapture={()=>{dirty.current=true;}}>
          {loading?<p role="status">載入預約表單中…</p>:error?<div role="alert"><p className="text-red-700">{error}</p><button type="button" className={`${button} mt-3 border-earth-200`} onClick={()=>void show()}>重新載入</button></div>:data&&<BookingCreateForm action={submit} preserveOnFailure>
            <div className="grid min-w-0 gap-5 md:grid-cols-2"><section className="min-w-0 space-y-3"><h3 className="font-medium">日期、時段與人數</h3><DashboardBookingForm {...data}/></section><div className="min-w-0"><CustomerAndPlanFields defaultMode={makeup?"makeup":undefined}/></div></div>
            <label className="block text-sm">備註<textarea name="notes" rows={2} className="mt-1 w-full rounded-lg border border-earth-200 p-3"/></label>
            {data.isAdmin&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" name="skipDutyCheck"/>略過值班檢查</label>}
            <CreateFooter close={close}/>
          </BookingCreateForm>}
        </div>
      </div>
    </RightSheet>,document.body)}
  </>;
}
function CreateFooter({close}:{close:()=>void}) {
  const {submitting}=useBookingFormValidation();
  return <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-earth-100 bg-white py-3"><button type="button" disabled={submitting} className={`${button} border-earth-200 bg-white disabled:opacity-50`} onClick={close}>取消</button><BookingCreateSubmit/></div>;
}
