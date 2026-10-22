"use client";
import { useKeyedReminderMutation } from "./reminder-setting-feedback";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { setSessionBalanceNotificationToggle } from "@/server/actions/session-balance-notification-toggle";
import { LineCardPreview } from "./line-card-preview";

import { useState, useTransition, useOptimistic } from "react";
import { toast } from "sonner";
import {
  saveSessionBalanceTemplateSetting,
} from "@/server/actions/reminder";
import {
  extractSessionBalanceCustomCopy,
  renderSessionBalanceTemplate,
  type SessionBalanceNotificationSettingValue,
} from "@/lib/session-balance-notification-settings";

const sample = {
  customerName: "王小美",
  planName: "蒸足保養 5 堂",
  bookingDateTime: "2026-08-26 14:00",
  bookingUrl: "",
};

function Switch({ checked, onClick, disabled, label }: { checked: boolean; onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button type="button" onClick={(event) => { event.preventDefault(); onClick(); }} disabled={disabled} aria-label={label} aria-busy={disabled} role="switch" aria-checked={checked} className={`relative h-7 w-12 rounded-full ${checked ? "bg-primary-600" : "bg-earth-300"}`}>
      <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

function CardPreview({ title, body, buttons }: { title: string; body: string; buttons: string[] }) {
  return <LineCardPreview title={title} subtitle={title === "堂數提醒" ? "方案剩餘最後 1 堂" : "本期方案已完成"} actions={buttons.map(label => ({ label, variant: label === "諮詢店長" ? "link" as const : "primary" as const }))}>{body}</LineCardPreview>;
}

export function SimpleSessionBalanceReminders({ initialSetting }: { initialSetting: SessionBalanceNotificationSettingValue }) {
  const [setting, setSetting] = useState(() => ({
    ...initialSetting,
    lastSessionUnbookedTemplate: extractSessionBalanceCustomCopy(initialSetting.lastSessionUnbookedTemplate),
    lastSessionBookedTemplate: extractSessionBalanceCustomCopy(initialSetting.lastSessionBookedTemplate),
    planUsedUpTemplate: extractSessionBalanceCustomCopy(initialSetting.planUsedUpTemplate),
  }));
  const [display, patch] = useOptimistic(setting, (current, change: { key: "lastSessionEnabled" | "planUsedUpEnabled"; enabled: boolean }) => ({ ...current, [change.key]: change.enabled }));
  const [scenario, setScenario] = useState<"unbooked" | "booked">("unbooked");
  const [pending, startTransition] = useTransition();
  const mutation = useKeyedReminderMutation();
  useSettingsPanelGuard(false, pending || mutation.pending);

  function update<K extends keyof SessionBalanceNotificationSettingValue>(key: K, value: SessionBalanceNotificationSettingValue[K]) {
    setSetting((current) => ({ ...current, [key]: value }));
  }

  function toggle(type: "lastSessionEnabled" | "planUsedUpEnabled") {
    const previous = display[type];
    const next = !previous;
    mutation.run(type, () => setSessionBalanceNotificationToggle({ key: type, enabled: next }), () => { setSetting(current => ({ ...current, [type]: next })); toast.success(next ? "提醒已開啟" : "提醒已關閉"); }, () => {
      patch({ key: type, enabled: next });
      return () => patch({ key: type, enabled: previous });
    });
  }

  function save() {
    startTransition(async () => {
      const result = await saveSessionBalanceTemplateSetting({
        lastSessionUnbookedTemplate: setting.lastSessionUnbookedTemplate,
        lastSessionBookedTemplate: setting.lastSessionBookedTemplate,
        planUsedUpTemplate: setting.planUsedUpTemplate,
        learnMoreButtonLabel: setting.learnMoreButtonLabel,
        laterButtonLabel: setting.laterButtonLabel,
      });
      if (result.success) toast.success("通知內容已儲存");
      else toast.error(result.error);
    });
  }

  const lastBody = scenario === "unbooked" ? setting.lastSessionUnbookedTemplate : setting.lastSessionBookedTemplate;
  return (
    <>
      {Object.entries(mutation.errors).filter(([,error]) => error).map(([key,error]) => <p key={key} role="alert" className="text-sm text-red-700">{key === "lastSessionEnabled" ? "剩餘最後 1 堂" : "方案已用完"}：{error}</p>)}
      <details className="group rounded-xl border border-earth-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4">
          <div><h2 className="text-base font-semibold text-earth-900">剩餘最後 1 堂</h2><p className="mt-1 text-sm text-earth-500">完成服務後剩 1 堂時提醒一次；只影響這項通知。</p></div>
          <div className="flex items-center gap-3">{mutation.isPending("lastSessionEnabled") && <span role="status" className="text-sm text-earth-500">儲存中…</span>}<Switch label="剩餘最後 1 堂提醒" checked={display.lastSessionEnabled} onClick={() => toggle("lastSessionEnabled")} disabled={mutation.isPending("lastSessionEnabled")} /><span className="text-earth-400 transition group-open:rotate-180">⌄</span></div>
        </summary>
        <div className="border-t border-earth-100 p-4">
          <div className="mb-4 flex rounded-lg bg-earth-100 p-1 text-sm">
            <button type="button" onClick={() => setScenario("unbooked")} className={`flex-1 rounded-md px-3 py-2 ${scenario === "unbooked" ? "bg-white font-semibold shadow-sm" : "text-earth-500"}`}>尚未預約</button>
            <button type="button" onClick={() => setScenario("booked")} className={`flex-1 rounded-md px-3 py-2 ${scenario === "booked" ? "bg-white font-semibold shadow-sm" : "text-earth-500"}`}>已經預約</button>
          </div>
          <label className="mb-1 block text-sm font-medium text-earth-700">提醒文字</label>
          <textarea value={lastBody} rows={6} maxLength={1500} onChange={(event) => update(scenario === "unbooked" ? "lastSessionUnbookedTemplate" : "lastSessionBookedTemplate", event.target.value)} className="w-full rounded-xl border border-earth-300 p-3 text-sm leading-relaxed" />
          <p className="mt-1 text-xs text-earth-400">顧客姓名、方案、日期與預約連結由系統自動帶入。</p>
          <details className="mt-4 rounded-xl border border-earth-200 p-3"><summary className="cursor-pointer text-sm font-medium text-earth-700">查看卡片預覽</summary><div className="mt-3"><CardPreview title="堂數提醒" body={renderSessionBalanceTemplate(lastBody, sample)} buttons={scenario === "unbooked" ? ["立即預約", "諮詢店長"] : ["諮詢店長"]} /></div></details>
          <button type="button" onClick={save} disabled={pending} className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">儲存變更</button>
        </div>
      </details>

      <details className="group rounded-xl border border-earth-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4">
          <div><h2 className="text-base font-semibold text-earth-900">方案用完提醒</h2><p className="mt-1 text-sm text-earth-500">最後一堂完成後提醒；已有接續方案時不發送。</p></div>
          <div className="flex items-center gap-3">{mutation.isPending("planUsedUpEnabled") && <span role="status" className="text-sm text-earth-500">儲存中…</span>}<Switch label="方案用完提醒" checked={display.planUsedUpEnabled} onClick={() => toggle("planUsedUpEnabled")} disabled={mutation.isPending("planUsedUpEnabled")} /><span className="text-earth-400 transition group-open:rotate-180">⌄</span></div>
        </summary>
        <div className="border-t border-earth-100 p-4">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-earth-700">提醒文字</label>
              <textarea value={setting.planUsedUpTemplate} rows={9} maxLength={1500} onChange={(event) => update("planUsedUpTemplate", event.target.value)} className="w-full rounded-xl border border-earth-300 p-3 text-sm leading-relaxed" />
              <p className="mt-1 text-xs text-earth-400">顧客姓名與方案由系統自動帶入。</p>
              <label className="block text-sm font-medium text-earth-700">儲值按鈕文字<input value={setting.learnMoreButtonLabel === "了解蒸足 VIP 方案" ? "我要儲值" : setting.learnMoreButtonLabel} onChange={(event) => update("learnMoreButtonLabel", event.target.value)} maxLength={20} className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2" /></label>
            </div>
            <details className="rounded-xl border border-earth-200 p-3"><summary className="cursor-pointer text-sm font-medium text-earth-700">查看卡片預覽</summary><div className="mt-3"><CardPreview title="方案提醒" body={renderSessionBalanceTemplate(setting.planUsedUpTemplate, sample)} buttons={[setting.learnMoreButtonLabel === "了解蒸足 VIP 方案" ? "我要儲值" : setting.learnMoreButtonLabel, "諮詢店長"]} /></div></details>
          </div>
          <p className="mt-3 text-xs text-earth-500">「我要儲值」與「諮詢店長」都會安全通知本店店長，實際動作由系統保護。</p>
          <button type="button" onClick={save} disabled={pending} className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">儲存變更</button>
        </div>
      </details>
    </>
  );
}
