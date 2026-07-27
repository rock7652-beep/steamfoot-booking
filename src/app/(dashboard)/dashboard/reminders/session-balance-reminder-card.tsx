"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  applySessionBalanceRulesToAllStores,
  applySessionBalanceTemplatesToAllStores,
  saveSessionBalanceRuleSetting,
  saveSessionBalanceTemplateSetting,
} from "@/server/actions/reminder";
import {
  DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING,
  renderSessionBalanceTemplate,
  type SessionBalanceNotificationSettingValue,
} from "@/lib/session-balance-notification-settings";

interface Props {
  initialSetting: SessionBalanceNotificationSettingValue;
  canApplyToAllStores: boolean;
  mode: "rules" | "templates";
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
  mode,
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

  function saveRules() {
    startTransition(async () => {
      const result = await saveSessionBalanceRuleSetting({
        isEnabled: setting.isEnabled,
        lastSessionEnabled: setting.lastSessionEnabled,
        planUsedUpEnabled: setting.planUsedUpEnabled,
      });
      if (!result.success) {
        toast.error(result.error ?? "設定儲存失敗");
        return;
      }
      toast.success("已儲存本分店的提醒開關");
    });
  }

  function saveTemplates() {
    startTransition(async () => {
      const result = await saveSessionBalanceTemplateSetting({
        lastSessionUnbookedTemplate: setting.lastSessionUnbookedTemplate,
        lastSessionBookedTemplate: setting.lastSessionBookedTemplate,
        planUsedUpTemplate: setting.planUsedUpTemplate,
        learnMoreButtonLabel: setting.learnMoreButtonLabel,
        laterButtonLabel: setting.laterButtonLabel,
      });
      if (!result.success) {
        toast.error(result.error ?? "訊息模板儲存失敗");
        return;
      }
      toast.success("已儲存本分店的訊息模板");
    });
  }

  function resetTemplates() {
    if (!window.confirm("確定要恢復系統預設文案嗎？提醒開關不會變更。")) return;
    setSetting((current) => ({
      ...current,
      lastSessionUnbookedTemplate:
        DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING.lastSessionUnbookedTemplate,
      lastSessionBookedTemplate:
        DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING.lastSessionBookedTemplate,
      planUsedUpTemplate:
        DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING.planUsedUpTemplate,
      learnMoreButtonLabel:
        DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING.learnMoreButtonLabel,
      laterButtonLabel:
        DEFAULT_SESSION_BALANCE_NOTIFICATION_SETTING.laterButtonLabel,
    }));
    toast.success("已載入系統預設文案，請按儲存套用");
  }

  function applyRulesToAll() {
    if (!window.confirm("確定將目前三個提醒開關套用到所有營運分店嗎？文案不會變更。")) return;
    startTransition(async () => {
      const result = await applySessionBalanceRulesToAllStores({
        isEnabled: setting.isEnabled,
        lastSessionEnabled: setting.lastSessionEnabled,
        planUsedUpEnabled: setting.planUsedUpEnabled,
      });
      if (!result.success) {
        toast.error(result.error ?? "同步開關失敗");
        return;
      }
      toast.success(`已將提醒開關套用到 ${result.data?.storeCount ?? 0} 間分店`);
    });
  }

  function applyTemplatesToAll() {
    if (!window.confirm("確定將目前文案與按鈕文字套用到所有營運分店嗎？各店提醒開關不會變更。")) return;
    startTransition(async () => {
      const result = await applySessionBalanceTemplatesToAllStores({
        lastSessionUnbookedTemplate: setting.lastSessionUnbookedTemplate,
        lastSessionBookedTemplate: setting.lastSessionBookedTemplate,
        planUsedUpTemplate: setting.planUsedUpTemplate,
        learnMoreButtonLabel: setting.learnMoreButtonLabel,
        laterButtonLabel: setting.laterButtonLabel,
      });
      if (!result.success) {
        toast.error(result.error ?? "同步文案失敗");
        return;
      }
      toast.success(`已將訊息模板套用到 ${result.data?.storeCount ?? 0} 間分店`);
    });
  }

  if (mode === "rules") {
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
              完成服務後剩 1 堂提醒一次；方案用完再提醒一次。文案請至「訊息模板」編輯。
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
              <p className="mt-1 text-xs text-earth-500">完成服務後剩 1 堂時提醒一次。</p>
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
              <p className="mt-1 text-xs text-earth-500">最後一堂完成後提醒；已有接續方案不發送。</p>
            </div>
            <Toggle
              checked={setting.planUsedUpEnabled}
              onChange={(value) => update("planUsedUpEnabled", value)}
              label="切換方案用完提醒"
              disabled={childDisabled}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-earth-100 pt-4">
          <button
            type="button"
            onClick={saveRules}
            disabled={pending}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {pending ? "處理中…" : "儲存本分店開關"}
          </button>
          {canApplyToAllStores && (
            <button
              type="button"
              onClick={applyRulesToAll}
              disabled={pending}
              className="ml-auto rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
            >
              將開關套用到所有分店
            </button>
          )}
        </div>
      </div>
    );
  }

  const templatesDisabled = pending || !setting.isEnabled;
  return (
    <div className="rounded-xl border border-earth-200 bg-white p-6 shadow-sm">
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
          編輯三種提醒情境的文案、按鈕文字並即時預覽 LINE 顯示效果。
        </p>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <TemplateEditor
          title="剩 1 堂｜尚未預約"
          description="提醒顧客依自己的步調安排最後一堂。"
          value={setting.lastSessionUnbookedTemplate}
          onChange={(value) => update("lastSessionUnbookedTemplate", value)}
          variables={["{customerName}", "{planName}", "{bookingUrl}"]}
          disabled={templatesDisabled || !setting.lastSessionEnabled}
        />
        <TemplateEditor
          title="剩 1 堂｜已經預約"
          description="帶入最後一堂日期，並溫和提到下一階段保養。"
          value={setting.lastSessionBookedTemplate}
          onChange={(value) => update("lastSessionBookedTemplate", value)}
          variables={["{customerName}", "{planName}", "{bookingDateTime}"]}
          disabled={templatesDisabled || !setting.lastSessionEnabled}
        />
        <div className="xl:col-span-2">
          <TemplateEditor
            title="剩 0 堂｜方案已用完"
            description="感謝顧客完成方案，保留了解方案或稍後再看的選擇權。"
            value={setting.planUsedUpTemplate}
            onChange={(value) => update("planUsedUpTemplate", value)}
            variables={["{customerName}", "{planName}"]}
            disabled={templatesDisabled || !setting.planUsedUpEnabled}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-xl border border-earth-200 p-4 md:grid-cols-2">
        <label className="text-sm font-medium text-earth-700">
          第一個按鈕
          <input
            value={setting.learnMoreButtonLabel}
            onChange={(event) => update("learnMoreButtonLabel", event.target.value)}
            disabled={templatesDisabled || !setting.planUsedUpEnabled}
            maxLength={20}
            className="mt-1.5 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 disabled:bg-earth-50"
          />
        </label>
        <label className="text-sm font-medium text-earth-700">
          第二個按鈕
          <input
            value={setting.laterButtonLabel}
            onChange={(event) => update("laterButtonLabel", event.target.value)}
            disabled={templatesDisabled || !setting.planUsedUpEnabled}
            maxLength={20}
            className="mt-1.5 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 disabled:bg-earth-50"
          />
        </label>
      </div>

      {!setting.isEnabled && (
        <p className="mt-3 text-xs text-earth-500">
          此分店目前已停用提醒；請先到「提醒設定」啟用後再編輯。
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-earth-100 pt-4">
        <button
          type="button"
          onClick={saveTemplates}
          disabled={pending || !setting.isEnabled}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "處理中…" : "儲存本分店文案"}
        </button>
        <button
          type="button"
          onClick={resetTemplates}
          disabled={pending || !setting.isEnabled}
          className="rounded-lg border border-earth-300 px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50 disabled:opacity-50"
        >
          恢復系統預設文案
        </button>
        {canApplyToAllStores && (
          <button
            type="button"
            onClick={applyTemplatesToAll}
            disabled={pending || !setting.isEnabled}
            className="ml-auto rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
          >
            將文案套用到所有分店
          </button>
        )}
      </div>
    </div>
  );
}
