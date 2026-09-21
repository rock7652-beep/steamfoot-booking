"use client";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateTrialSettings } from "@/server/actions/shop";
import type { TrialSettings } from "@/lib/shop-config";

interface Props {
  storeId: string;
  initial: TrialSettings;
  saveAction?: (input:TrialSettings)=>Promise<{success:boolean;error?:string}>;
  courseMode?: boolean;
  compact?: boolean;
}

const inputCls =
  "mt-1 block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const labelCls = "block text-sm font-medium text-earth-700";

function toInt(v: string): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
}

export function TrialSettingsForm({ storeId, initial, saveAction = updateTrialSettings, courseMode = false, compact = false }: Props) {
  const formId = useId();
  const [trialEnabled, setTrialEnabled] = useState(initial.trialEnabled);
  const [defaultPrice, setDefaultPrice] = useState(String(initial.trialDefaultPrice));
  const [allowEdit, setAllowEdit] = useState(initial.trialAllowPriceEdit);
  const [minPrice, setMinPrice] = useState(String(initial.trialMinPrice));
  const [maxPrice, setMaxPrice] = useState(String(initial.trialMaxPrice));
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const saving = useRef(false);
  const draft = JSON.stringify([trialEnabled, defaultPrice, allowEdit, minPrice, maxPrice]);
  const [savedDraft, setSavedDraft] = useState(draft);
  useSettingsPanelGuard(draft !== savedDraft, pending);

  const d = toInt(defaultPrice);
  const lo = toInt(minPrice);
  const hi = toInt(maxPrice);

  const errors: string[] = [];
  if (lo < 0 || hi < 0 || d < 0) errors.push("價格不可為負數");
  if (lo > hi) errors.push("最低價不可大於最高價");
  if (d < lo || d > hi) errors.push("預設價必須介於最低價與最高價之間");
  const invalid = errors.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving.current || draft === savedDraft) return;
    if (invalid) {
      toast.error(errors[0]);
      return;
    }
    saving.current = true;
    startTransition(async () => {
      try {
      const result = await saveAction({
        trialEnabled,
        trialDefaultPrice: d,
        trialAllowPriceEdit: allowEdit,
        trialMinPrice: lo,
        trialMaxPrice: hi,
      });
      if (result.success) {
        setSavedDraft(draft);
        toast.success("體驗課設定已更新");
        router.refresh();
      } else {
        toast.error(result.error ?? "儲存失敗");
      }
      } catch { toast.error("連線失敗，輸入內容已保留，請重試"); }
      finally { saving.current = false; }
    });
  }

  return (
    <form
      data-store-id={storeId}
      onSubmit={handleSubmit}
      aria-label="體驗設定"
      className={compact ? "mt-4 space-y-3" : "grid grid-cols-1 gap-4 lg:grid-cols-12"}
    >
      {/* Left: form */}
      <fieldset disabled={pending} className={compact ? "min-w-0" : "min-w-0 lg:col-span-7"}>
        <section className={compact ? "bg-white" : "rounded-xl border border-earth-200 bg-white p-5 shadow-sm"}>
          <header hidden={compact} className="mb-4">
            <h2 data-panel-secondary-title className="text-sm font-semibold text-earth-900">體驗課設定</h2>
            <p className="mt-0.5 text-[11px] text-earth-500">
              右側預覽為建立體驗單時店長看到的價格欄位行為
            </p>
          </header>

          <div className={compact ? "grid gap-4 sm:grid-cols-2" : "space-y-4"}>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-earth-200 px-3 py-2.5">
              <span>
                <span className="text-sm font-medium text-earth-800">啟用體驗單功能</span>
                <span className="mt-0.5 block text-[11px] text-earth-500">
                  關閉後，顧客頁與月曆將隱藏「建立體驗單」入口
                </span>
              </span>
              <input
                type="checkbox"
                checked={trialEnabled}
                onChange={(e) => setTrialEnabled(e.target.checked)}
                className="h-5 w-5 rounded border-earth-300 text-primary-600 focus:ring-primary-300"
              />
            </label>

            <div>
              <label htmlFor={`${formId}-預設體驗價格（NT$）`} className={labelCls}>預設體驗價格（NT$）</label>

              <input id={`${formId}-預設體驗價格（NT$）`}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={defaultPrice}
                onChange={(e) => setDefaultPrice(e.target.value)}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-earth-400">
                建立體驗單時預設帶入此價格，可依活動調整
              </p>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-earth-200 px-3 py-2.5">
              <span>
                <span className="text-sm font-medium text-earth-800">
                  允許建立時調整價格
                </span>
                <span className="mt-0.5 block text-[11px] text-earth-500">
                  關閉後，建立體驗單一律使用預設價格
                </span>
              </span>
              <input
                type="checkbox"
                checked={allowEdit}
                onChange={(e) => setAllowEdit(e.target.checked)}
                className="h-5 w-5 rounded border-earth-300 text-primary-600 focus:ring-primary-300"
              />
            </label>

            <div className={compact ? "grid grid-cols-2 gap-3 sm:col-span-2" : "grid grid-cols-1 gap-3 sm:grid-cols-2"}>
              <div>
                <label htmlFor={`${formId}-最低可輸入價格`} className={labelCls}>最低可輸入價格</label>

                <input id={`${formId}-最低可輸入價格`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  disabled={!allowEdit}
                  className={`${inputCls} disabled:bg-earth-50 disabled:text-earth-400`}
                />
              </div>
              <div>
                <label htmlFor={`${formId}-最高可輸入價格`} className={labelCls}>最高可輸入價格</label>

                <input id={`${formId}-最高可輸入價格`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  disabled={!allowEdit}
                  className={`${inputCls} disabled:bg-earth-50 disabled:text-earth-400`}
                />
              </div>
            </div>

            {invalid ? (
              <ul className="rounded-md bg-red-50 px-3 py-2 text-[11px] text-red-700">
                {errors.map((m) => (
                  <li key={m}>• {m}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-earth-100 bg-white py-3">
            <span className="text-[11px] text-earth-400">
              {pending ? "儲存中..." : draft !== savedDraft ? "尚未儲存" : "尚未變更"}
            </span>
            <button type="button" disabled={pending || draft === savedDraft} onClick={() => { const [enabled, price, edit, min, max] = JSON.parse(savedDraft); setTrialEnabled(enabled); setDefaultPrice(price); setAllowEdit(edit); setMinPrice(min); setMaxPrice(max); }} className="min-h-11 rounded-lg border px-4 disabled:opacity-50">還原修改</button>
            <button
              type="submit"
              disabled={pending || invalid || draft === savedDraft}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {pending ? "儲存中..." : "儲存"}
            </button>
          </div>
        </section>
      </fieldset>

      {/* Right: behavior preview */}
      <details open={compact ? undefined : true} className={compact ? "text-sm" : "lg:col-span-5"}>
        <summary className={compact ? "min-h-11 cursor-pointer py-3 text-primary-700" : "hidden"}>建立體驗單預覽</summary>
        <section className="lg:sticky lg:top-4 rounded-xl border border-earth-200 bg-earth-50/40 p-5 shadow-sm">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-earth-900">建立體驗單預覽</h2>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-earth-500">
              店長看到的樣子
            </span>
          </header>

          <div className="rounded-xl border border-earth-200 bg-white p-4">
            {!trialEnabled ? (
              <p className="rounded-md bg-earth-50 px-3 py-4 text-center text-xs text-earth-500">
                體驗單功能已停用
                <br />
                顧客頁與月曆不會顯示「建立體驗單」
              </p>
            ) : (
              <>
                <h3 className="mb-1 text-sm font-semibold text-earth-900">體驗費用</h3>
                <div className="flex items-center gap-2">
                  <span className="text-earth-500">NT$</span>
                  <span className="rounded-md border border-earth-200 px-3 py-1.5 font-mono text-sm tabular-nums text-earth-800">
                    {invalid ? "—" : d}
                  </span>
                  {allowEdit ? (
                    <span className="rounded-md border border-earth-200 bg-white px-2 py-1 text-[11px] text-earth-500">
                      恢復預設
                    </span>
                  ) : (
                    <span className="text-[11px] text-earth-400">（不可調整）</span>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-earth-500">
                  {allowEdit
                    ? `可輸入範圍 NT$${invalid ? "—" : lo}–${invalid ? "—" : hi}；預設價格來自店家設定，可依活動調整。`
                    : "建立體驗單一律使用預設價格。"}
                </p>
              </>
            )}
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-earth-500">
            {courseMode ? "每位實際上課者各有體驗預約與金額快照；收款與出席分開，不使用點數卡。調整預設價不影響舊單。" : "體驗課只有一個。每筆體驗單在建立當下記錄金額快照，日後調整預設價不影響舊單。"}
          </p>
        </section>
      </details>
    </form>
  );
}
