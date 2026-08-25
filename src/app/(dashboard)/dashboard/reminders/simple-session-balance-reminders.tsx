"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  saveSessionBalanceRuleSetting,
  saveSessionBalanceTemplateSetting,
} from "@/server/actions/reminder";
import {
  renderSessionBalanceTemplate,
  type SessionBalanceNotificationSettingValue,
} from "@/lib/session-balance-notification-settings";

const sample = {
  customerName: "王小美",
  planName: "蒸足保養 5 堂",
  bookingDateTime: "2026-08-26 14:00",
  bookingUrl: "https://www.steamfoot.com/預約連結",
};

function Switch({ checked, onClick, disabled }: { checked: boolean; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" onClick={(event) => { event.preventDefault(); onClick(); }} disabled={disabled} aria-pressed={checked} className={`relative h-7 w-12 rounded-full ${checked ? "bg-primary-600" : "bg-earth-300"}`}>
      <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

function CardPreview({ title, body, buttons }: { title: string; body: string; buttons: string[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-earth-200 bg-white shadow-sm">
      <div className="bg-[#F3EDE5] p-3 text-sm font-semibold text-earth-800">蒸管家｜{title}</div>
      <div className="whitespace-pre-wrap p-3 text-sm leading-relaxed text-earth-700">{body}</div>
      <div className="space-y-2 border-t border-earth-100 p-3 text-center text-xs font-semibold text-white">
        {buttons.map((button, index) => <div key={button} className={`rounded-lg px-3 py-2 ${index === 0 ? "bg-primary-600" : "bg-[#8B6B52]"}`}>{button}</div>)}
      </div>
    </div>
  );
}

export function SimpleSessionBalanceReminders({ initialSetting }: { initialSetting: SessionBalanceNotificationSettingValue }) {
  const [setting, setSetting] = useState(initialSetting);
  const [scenario, setScenario] = useState<"unbooked" | "booked">("unbooked");
  const [pending, startTransition] = useTransition();

  function update<K extends keyof SessionBalanceNotificationSettingValue>(key: K, value: SessionBalanceNotificationSettingValue[K]) {
    setSetting((current) => ({ ...current, [key]: value }));
  }

  function toggle(type: "lastSessionEnabled" | "planUsedUpEnabled") {
    const next = { ...setting, [type]: !setting[type] };
    setSetting(next);
    startTransition(async () => {
      const result = await saveSessionBalanceRuleSetting({
        isEnabled: next.lastSessionEnabled || next.planUsedUpEnabled,
        lastSessionEnabled: next.lastSessionEnabled,
        planUsedUpEnabled: next.planUsedUpEnabled,
      });
      if (!result.success) {
        setSetting(setting);
        toast.error(result.error);
        return;
      }
      toast.success(next[type] ? "提醒已開啟" : "提醒已關閉");
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
      <details className="group rounded-xl border border-earth-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4">
          <div><h2 className="text-base font-semibold text-earth-900">剩餘最後 1 堂</h2><p className="mt-1 text-sm text-earth-500">完成服務後剩 1 堂時提醒一次；只影響這項通知。</p></div>
          <div className="flex items-center gap-3"><Switch checked={setting.lastSessionEnabled} onClick={() => toggle("lastSessionEnabled")} disabled={pending} /><span className="text-earth-400 transition group-open:rotate-180">⌄</span></div>
        </summary>
        <div className="border-t border-earth-100 p-4">
          <div className="mb-4 flex rounded-lg bg-earth-100 p-1 text-sm">
            <button type="button" onClick={() => setScenario("unbooked")} className={`flex-1 rounded-md px-3 py-2 ${scenario === "unbooked" ? "bg-white font-semibold shadow-sm" : "text-earth-500"}`}>尚未預約</button>
            <button type="button" onClick={() => setScenario("booked")} className={`flex-1 rounded-md px-3 py-2 ${scenario === "booked" ? "bg-white font-semibold shadow-sm" : "text-earth-500"}`}>已經預約</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <textarea value={lastBody} rows={9} maxLength={1500} onChange={(event) => update(scenario === "unbooked" ? "lastSessionUnbookedTemplate" : "lastSessionBookedTemplate", event.target.value)} className="w-full rounded-xl border border-earth-300 p-3 text-sm leading-relaxed" />
            <CardPreview title="堂數提醒" body={renderSessionBalanceTemplate(lastBody, sample)} buttons={scenario === "unbooked" ? ["立即預約", "諮詢店長"] : ["諮詢店長"]} />
          </div>
          <button type="button" onClick={save} disabled={pending} className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">儲存最後一堂通知</button>
        </div>
      </details>

      <details className="group rounded-xl border border-earth-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4">
          <div><h2 className="text-base font-semibold text-earth-900">方案用完提醒</h2><p className="mt-1 text-sm text-earth-500">最後一堂完成後提醒；已有接續方案時不發送。</p></div>
          <div className="flex items-center gap-3"><Switch checked={setting.planUsedUpEnabled} onClick={() => toggle("planUsedUpEnabled")} disabled={pending} /><span className="text-earth-400 transition group-open:rotate-180">⌄</span></div>
        </summary>
        <div className="border-t border-earth-100 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <textarea value={setting.planUsedUpTemplate} rows={9} maxLength={1500} onChange={(event) => update("planUsedUpTemplate", event.target.value)} className="w-full rounded-xl border border-earth-300 p-3 text-sm leading-relaxed" />
              <label className="block text-sm font-medium text-earth-700">儲值按鈕文字<input value={setting.learnMoreButtonLabel === "了解蒸足 VIP 方案" ? "我要儲值" : setting.learnMoreButtonLabel} onChange={(event) => update("learnMoreButtonLabel", event.target.value)} maxLength={20} className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2" /></label>
            </div>
            <CardPreview title="方案提醒" body={renderSessionBalanceTemplate(setting.planUsedUpTemplate, sample)} buttons={[setting.learnMoreButtonLabel === "了解蒸足 VIP 方案" ? "我要儲值" : setting.learnMoreButtonLabel, "諮詢店長"]} />
          </div>
          <p className="mt-3 text-xs text-earth-500">「我要儲值」與「諮詢店長」都會安全通知本店店長，實際動作由系統保護。</p>
          <button type="button" onClick={save} disabled={pending} className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">儲存方案用完通知</button>
        </div>
      </details>
    </>
  );
}
