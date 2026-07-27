"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  applySessionBalanceSettingToAllStores,
  resetSessionBalanceNotificationSetting,
  saveSessionBalanceNotificationSetting,
} from "@/server/actions/reminder";
import {
  DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING,
  renderSessionBalanceTemplate,
  type SessionBalanceNotificationSettingValue,
} from "@/lib/session-balance-notification-settings";

interface Props {
  initialSetting: SessionBalanceNotificationSettingValue;
  canApplyToAllStores: boolean;
}

const SAMPLE_VARIABLES = {
  customerName: "王小美",
  planName: "蒸足保養 5 堂",
  bookingDateTime: "2026-08-05 14:00",
  bookingUrl: "https://www.steamfoot.com/預約連結",
};

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      aria-label={label}
      aria-pressed={checked}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? "bg-primary-600" : "bg-earth-300"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

function TemplateEditor({
  title,
  description,
  value,
  onChange,
  variables,
  disabled,
}: {
  title: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  variables: string[];
  disabled: boolean;
}) {
  return (
    <div className="rounded-xl border border-earth-200 p-4">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-earth-800">{title}</h4>
        <p className="mt-1 text-xs leading-relaxed text-earth-500">{description}</p>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={6}
        maxLength={1500}
        className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm leading-relaxed text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300 disabled:bg-earth-50 disabled:opacity-70"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {variables.map((variable) => (
          <span
            key={variable}
            className="rounded bg-primary-50 px-2 py-1 font-mono text-[11px] text-primary-700"
          >
            {variable}
          </span>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-[#06C755]/10 p-3">
        <p className="mb-1 text-[11px] font-medium text-earth-500">LINE 預覽</p>
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-earth-700">
          {renderSessionBalanceTemplate(value, SAMPLE_VARIABLES)}
        </p>
      </div>
    </div>
  );
}

export function SessionBalanceReminderCard({
  initialSetting,
  canApplyToAllStores,
}: Props) {
  const [setting, setSetting] =
    useState<SessionBalanceNotificationSettingValue>(initialSetting);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof SessionBalanceNotificationSettingValue>(
    key: K,
    value: SessionBalanceNotificationSettingValue[K],
  ) {
    setSetting((current) => ({ ...current, [key]: value }));
  }

  function save() {
    startTransition(async () => {
      const result = await saveSessionBalanceNotificationSetting(setting);
      if (!result.success) {
        toast.error(result.error ?? "設定儲存失敗");
        return;
      }
      toast.success("已儲存本分店的剩餘堂數提醒");
    });
  }

  function reset() {
    if (!window.confirm("確定要恢復系統預設文案與開關嗎？")) return;
    startTransition(async () => {
      const result = await resetSessionBalanceNotificationSetting();
      if (!result.success) {
        toast.error(result.error ?? "恢復預設值失敗");
        return;
      }
      setSetting({ ...DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING });
      toast.success("已恢復系統預設值");
    });
  }

  function applyToAll() {
    if (
      !window.confirm(
        "確定將目前設定套用到所有營運中的分店嗎？各分店原本的文案與開關會被取代。",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await applySessionBalanceSettingToAllStores(setting);
      if (!result.success) {
        toast.error(result.error ?? "套用到所有分店失敗");
        return;
      }
      toast.success(`已套用到 ${result.data?.storeCount ?? 0} 間分店`);
    });
  }

  const childDisabled = pending || !setting.isEnabled;

  return (
    <div className="rounded-xl border border-earth-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-earth-900">
              剩餘堂數與續購提醒
            </h3>
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
              各分店獨立
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-earth-500">
            完成服務後剩 1 堂提醒一次；方案用完再提醒一次。已有接續方案時不發用完提醒。
          </p>
        </div>
        <Toggle
          checked={setting.isEnabled}
          onChange={(value) => update("isEnabled", value)}
          label={setting.isEnabled ? "停用剩餘堂數提醒" : "啟用剩餘堂數提醒"}
          disabled={pending}
        />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="flex items-center justify-between rounded-xl border border-earth-200 p-4">
          <div>
            <p className="text-sm font-medium text-earth-800">剩餘 1 堂提醒</p>
            <p className="mt-1 text-xs text-earth-500">最後一堂尚未預約或已預約時，各發一次適合的文案。</p>
          </div>
          <Toggle
            checked={setting.lastSessionEnabled}
            onChange={(value) => update("lastSessionEnabled", value)}
            label="切換剩餘 1 堂提醒"
            disabled={childDisabled}
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-earth-200 p-4">
          <div>
            <p className="text-sm font-medium text-earth-800">方案用完提醒</p>
            <p className="mt-1 text-xs text-earth-500">完成最後一堂後溫和引導，不會催促已續購顧客。</p>
          </div>
          <Toggle
            checked={setting.planUsedUpEnabled}
            onChange={(value) => update("planUsedUpEnabled", value)}
            label="切換方案用完提醒"
            disabled={childDisabled}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <TemplateEditor
          title="剩 1 堂｜尚未預約"
          description="提醒顧客依自己的步調安排最後一堂。"
          value={setting.lastSessionUnbookedTemplate}
          onChange={(value) => update("lastSessionUnbookedTemplate", value)}
          variables={["{customerName}", "{planName}", "{bookingUrl}"]}
          disabled={childDisabled || !setting.lastSessionEnabled}
        />
        <TemplateEditor
          title="剩 1 堂｜已經預約"
          description="帶入最後一堂日期，並溫和提到下一階段保養。"
          value={setting.lastSessionBookedTemplate}
          onChange={(value) => update("lastSessionBookedTemplate", value)}
          variables={["{customerName}", "{planName}", "{bookingDateTime}"]}
          disabled={childDisabled || !setting.lastSessionEnabled}
        />
        <div className="xl:col-span-2">
          <TemplateEditor
            title="剩 0 堂｜方案已用完"
            description="感謝顧客完成方案，保留了解方案或稍後再看的選擇權。"
            value={setting.planUsedUpTemplate}
            onChange={(value) => update("planUsedUpTemplate", value)}
            variables={["{customerName}", "{planName}"]}
            disabled={childDisabled || !setting.planUsedUpEnabled}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-xl border border-earth-200 p-4 md:grid-cols-2">
        <label className="text-sm font-medium text-earth-700">
          第一個按鈕
          <input
            value={setting.learnMoreButtonLabel}
            onChange={(event) => update("learnMoreButtonLabel", event.target.value)}
            disabled={childDisabled || !setting.planUsedUpEnabled}
            maxLength={20}
            className="mt-1.5 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 disabled:bg-earth-50"
          />
        </label>
        <label className="text-sm font-medium text-earth-700">
          第二個按鈕
          <input
            value={setting.laterButtonLabel}
            onChange={(event) => update("laterButtonLabel", event.target.value)}
            disabled={childDisabled || !setting.planUsedUpEnabled}
            maxLength={20}
            className="mt-1.5 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 disabled:bg-earth-50"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-earth-100 pt-4">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "處理中…" : "儲存本分店設定"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="rounded-lg border border-earth-300 px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50 disabled:opacity-50"
        >
          恢復系統預設
        </button>
        {canApplyToAllStores && (
          <button
            type="button"
            onClick={applyToAll}
            disabled={pending}
            className="ml-auto rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
          >
            套用到所有分店
          </button>
        )}
      </div>
    </div>
  );
}
