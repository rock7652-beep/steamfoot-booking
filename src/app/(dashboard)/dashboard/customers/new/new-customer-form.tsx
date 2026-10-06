"use client";
import styles from "@/components/admin/profile-plan-layout.module.css";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useFormDraft, FormDraftNotice } from "@/components/operations/use-form-draft";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { SubmitButton } from "@/components/submit-button";
import { BirthdayFields } from "@/components/birthday-fields";
import { FormShell, FormSection, FormGrid, StickyFormActions } from "@/components/desktop";
const inputCls =
  "block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const labelCls = "block text-sm font-medium text-earth-700";

type Result = { success: boolean; error?: string; existingCustomerId?: string };
export function NewCustomerForm({ isSpa, staffOptions, save, returnUrl }: {
  isSpa: boolean; staffOptions: {id:string;displayName:string}[]; save:(data:FormData)=>Promise<Result>; returnUrl:string;
}) {
  const router=useRouter();
  const draft=useFormDraft("customer:new", {name:"",phone:"",email:"",gender:"",assignedStaffId:"",lineName:"",serviceNote:"",birthYear:"1970",birthMonth:"",birthDay:""});
  const [state,action,pending]=useActionState(async(previous:{error:string;existingCustomerId:string},data:FormData)=>{
    if(draft.busy.current)return previous;
    draft.busy.current=true;
    try {
      const result=await save(data);
      if(!draft.mounted.current)return previous;
      if(!result.success)return {error:result.error??"新增失敗，輸入已保留",existingCustomerId:result.existingCustomerId??""};
      draft.clear();router.push(returnUrl);router.refresh();
      return {error:"",existingCustomerId:""};
    }catch{return {error:"連線中斷，輸入已保留，請稍後重試。",existingCustomerId:""};}
    finally{draft.busy.current=false;}
  },{error:"",existingCustomerId:""});
  return (
      <FormShell width="md">
        <form action={action} className={`${styles.form} space-y-6 pb-4`}>
          <FormDraftNotice dirty={draft.dirty} stale={false} onDiscard={()=>draft.discard()} />
          {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
          {state.existingCustomerId && <Link href={`/dashboard/customers/${state.existingCustomerId}`}>前往既有顧客 →</Link>}
          <fieldset disabled={pending} className="contents">
          {/* 快速建立 — 預設顯示，10 秒可建一筆 */}
          <FormSection
            title="快速建立"
            description="只需姓名 + 手機，其餘可稍後補"
          >
            <div>
              <label className={labelCls}>
                姓名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name" value={draft.values.name} onChange={e => draft.set("name", e.target.value)}
                required
                className={`mt-1 ${inputCls}`}
                placeholder="輸入顧客姓名"
              />
            </div>

            <div>
              <label className={labelCls}>
                電話 <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                name="phone" value={draft.values.phone} onChange={e => draft.set("phone", e.target.value)}
                required
                pattern="^(09\d{8}|09\d{2}[\s-]?\d{3}[\s-]?\d{3}|\+?886\d{9})$"
                title="09 開頭共 10 碼，可含空格 / - / +886"
                className={`mt-1 ${inputCls}`}
                placeholder="0912345678"
              />
              <p className="mt-1 text-[11px] text-earth-400">
                可直接貼上 0912-345-678 / +886912345678，系統會自動轉成 10 碼
              </p>
            </div>
          </FormSection>

          {/* 進階資料 — 預設收起 */}
          <details className="group rounded-lg border border-earth-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-4 py-3 text-sm font-medium text-earth-700 hover:bg-earth-50">
              <span>進階資料（選填）</span>
              <span className="text-xs text-earth-400 transition group-open:rotate-180">
                ▾
              </span>
            </summary>
            <div className="space-y-6 border-t border-earth-100 px-4 py-5">
              <FormSection title="個人資訊">
                <FormGrid className={styles.fieldGrid}>
                  <div>
                    <label className={labelCls}>Email</label>
                    <input
                      type="email"
                      name="email" value={draft.values.email} onChange={e => draft.set("email", e.target.value)}
                      className={`mt-1 ${inputCls}`}
                      placeholder="example@email.com"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>性別</label>
                    <select
                      name="gender" value={draft.values.gender} onChange={e => draft.set("gender", e.target.value)}
                      className={`mt-1 ${inputCls}`}
                    >
                      <option value="">未設定</option>
                      <option value="male">男</option>
                      <option value="female">女</option>
                      <option value="other">其他</option>
                    </select>
                  </div>
                </FormGrid>
                <div>
                  <label className={labelCls}>生日</label>
                  <BirthdayFields className={inputCls} parts={{year:draft.values.birthYear,month:draft.values.birthMonth,day:draft.values.birthDay}} onPartsChange={p=>draft.setMany({birthYear:p.year,birthMonth:p.month,birthDay:p.day})} />
                </div>
              </FormSection>

              <FormSection title="系統關聯" description="可稍後再指派">
                <div>
                  <label className={labelCls}>
                    {isSpa ? "負責人員" : "所屬店長 / 教練"}
                  </label>
                  <select name="assignedStaffId" value={draft.values.assignedStaffId} onChange={e => draft.set("assignedStaffId", e.target.value)} className={`mt-1 ${inputCls}`}>
                    <option value="">暫不指派</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>LINE 名稱</label>
                  <input
                    type="text"
                    name="lineName" value={draft.values.lineName} onChange={e => draft.set("lineName", e.target.value)}
                    className={`mt-1 ${inputCls}`}
                    placeholder="顧客 LINE 暱稱"
                  />
                </div>
              </FormSection>

              <FormSection title="店內備註">
                <textarea
                  name="serviceNote" value={draft.values.serviceNote} onChange={e => draft.set("serviceNote", e.target.value)}
                  rows={4}
                  className={inputCls}
                  placeholder="僅店內可見，每次服務都適用。例如：怕冷、座位偏好"
                />
              </FormSection>
            </div>
          </details>

          </fieldset>
          <StickyFormActions info={<span>儲存後會回到顧客列表</span>}>
            <Link
              href="/dashboard/customers"
              className="rounded-lg border border-earth-300 bg-white px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
            >
              取消
            </Link>
            <SubmitButton
              label="確認新增"
              pendingLabel="新增中..."
              className="bg-primary-600 text-white hover:bg-primary-700"
            />
          </StickyFormActions>
        </form>
      </FormShell>
  );
}
