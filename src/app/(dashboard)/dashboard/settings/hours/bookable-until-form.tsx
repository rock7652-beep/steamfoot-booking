"use client";
import styles from "@/components/settings/settings-form-layout.module.css";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";

import { useId, useRef, useState, useTransition } from "react";
import { useSettingsSave } from "@/components/admin/use-settings-save";
import { savedBookingWindow, bookingWindowRevision } from "@/lib/course-booking-window-save";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { addTaiwanDuration, formatDateZh } from "@/lib/date-utils";

interface Props {
  course?: boolean;
  spa?: boolean;
  storeId?: string;
  initialOpensAt?: string | null;
  direct?: boolean;
  /** 目前 ShopConfig.bookableUntilDate（"YYYY-MM-DD"）；null = 未設定 */
  initialDate: string | null;
  initialDays: number;
  today: string;
  canManage: boolean;
}

export function BookableUntilForm({
  initialDate,
  initialDays,
  storeId,
  initialOpensAt = null,
  today,
  canManage,
  course = false,
  spa = false,
  direct = false,
}: Props) {
  const radioGroup = useId();
  const initialMode = initialDate ? "fixed" : "rolling";
  const [mode, setMode] = useState<"fixed" | "rolling">(initialMode);
  const [fixedDate, setFixedDate] = useState(initialDate ?? "");
  const [days, setDays] = useState(initialDays);
  const [savedMode, setSavedMode] = useState<"fixed" | "rolling">(initialMode);
  const [savedDate, setSavedDate] = useState(initialDate);
  const [savedDays, setSavedDays] = useState(initialDays);
  const [expanded, setExpanded] = useState(false);
  const [legacyPending, startTransition] = useTransition();
  const pathname=usePathname();
  const request=useSettingsSave(`${pathname.split("/dashboard")[0]}/dashboard/settings-save/${course?"course/":spa?"spa/":""}booking-window`,storeId??"",savedBookingWindow);
  const pending=legacyPending||request.pending;
  const locked=pending||request.uncertain;
  const [savedOpensAt,setSavedOpensAt]=useState(initialOpensAt);
  const [error,setError]=useState("");
  const router = useRouter();
  const saving = useRef(false);

  const dirty = mode !== savedMode || (mode === "fixed" ? fixedDate !== savedDate : days !== savedDays);
  const sourceRevision=bookingWindowRevision({date:initialDate,days:initialDays,opensAt:initialOpensAt});
  const [previousSource,setPreviousSource]=useState(sourceRevision);
  const [awaitingSource,setAwaitingSource]=useState<string|null>(null);
  if(previousSource!==sourceRevision){
    setPreviousSource(sourceRevision);
    if(!awaitingSource||awaitingSource===sourceRevision){
      setAwaitingSource(null);setSavedDate(initialDate);setSavedDays(initialDays);setSavedOpensAt(initialOpensAt);setSavedMode(initialMode);
      if(!dirty&&!locked){setMode(initialMode);setFixedDate(initialDate??"");setDays(initialDays);}
    }
  }
  useSettingsPanelGuard(dirty, locked);

  function cancel() {
    if(locked)return;
    setMode(savedMode);
    setFixedDate(savedDate ?? "");
    setDays(savedDays);
    setExpanded(false);
  }

  function save() {
    if (saving.current || (!dirty && !request.uncertain) || !canManage) return;
    saving.current = true;
    startTransition(async () => {
      try {
      if (mode === "fixed" && !fixedDate) {
        toast.error("請選擇開放預約的截止日期");
        return;
      }
      setError("");
      {
        if(!storeId) {setError("門市資料缺失，請重新開啟設定");return;}
        const result=await request.save({values:mode==="fixed"?{mode,date:fixedDate}:{mode,days},expectedRevision:bookingWindowRevision({date:savedDate,days:savedDays,opensAt:savedOpensAt})});
        if(!result.success){setError(result.error);if(!result.uncertain)router.refresh();return;}
        const saved=result.data;
        const revision=bookingWindowRevision(saved);setAwaitingSource(revision===sourceRevision?null:revision);
        setSavedDate(saved.date);setSavedDays(saved.days);setSavedOpensAt(saved.opensAt);
        setSavedMode(saved.date?"fixed":"rolling");setMode(saved.date?"fixed":"rolling");setFixedDate(saved.date??"");setDays(saved.days);
        toast.success(result.syncWarning?"已儲存；其他頁面更新失敗，請重新整理核對。":"已儲存");
        setExpanded(false);
        return;
      }
      } catch { toast.error("連線失敗，輸入內容已保留，請重試"); }
      finally { saving.current = false; }
    });
  }

  return (
    <section className={`${styles.root} ${direct ? "border-b border-earth-100" : "rounded-xl border border-earth-200 bg-white px-4 py-3 shadow-sm"}`}>
      <header className={direct ? styles.statusRow : "flex flex-wrap items-center justify-between gap-3"}>
        <h2 className="text-sm font-semibold text-earth-900">預約開放期限</h2>
        <p className="min-w-0 text-sm tabular-nums text-earth-600">
          {savedMode === "fixed" && savedDate
            ? `開放至 ${formatDateZh(savedDate)}`
            : `未來 ${savedDays} 天・自動延長`}
        </p>
        {canManage && (
          <button type="button" disabled={locked} onClick={() => expanded ? cancel() : setExpanded(true)} className="min-h-10 min-w-24 shrink-0 justify-self-end rounded-lg border border-earth-200 px-3 text-sm font-medium text-primary-700 hover:bg-earth-50 focus:outline-none focus:ring-2 focus:ring-primary-200">
            {expanded ? "取消" : "修改"}
          </button>
        )}
      </header>

      {expanded && dirty && <p role="status" className={`${direct ? styles.indented : ""} mt-2 text-sm font-medium text-amber-700`}>未儲存</p>}
      {expanded && <fieldset className={direct ? `${styles.indented} ${styles.optionGrid} mt-2 text-sm text-earth-600` : "mt-3 space-y-2 text-xs text-earth-600"}>
        <legend className="sr-only">預約開放方式</legend>
        <label
          className={`block cursor-pointer rounded-lg border px-3 py-2 ${mode === "fixed" ? "border-primary-400 bg-primary-50" : "border-earth-300 bg-white"}`}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-earth-800">
            <input
              type="radio"
              name={radioGroup}
              checked={mode === "fixed"}
              disabled={!canManage || locked}
              onChange={() => setMode("fixed")}
            />
            開放至指定日期
          </span>
          {mode === "fixed" && (
            <input
              type="date"
              aria-label="開放預約截止日期"
              min={today}
              value={fixedDate}
              disabled={!canManage || locked}
              onChange={(event) => setFixedDate(event.target.value)}
              className="mt-1.5 min-h-9 w-full rounded-lg border border-earth-300 bg-white px-2.5 py-1 text-sm text-earth-800 disabled:opacity-60"
            />
          )}
        </label>

        <label
          className={`block cursor-pointer rounded-lg border px-3 py-2 ${mode === "rolling" ? "border-primary-400 bg-primary-50" : "border-earth-300 bg-white"}`}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-earth-800">
            <input
              type="radio"
              name={radioGroup}
              checked={mode === "rolling"}
              disabled={!canManage || locked}
              onChange={() => setMode("rolling")}
            />
            自動開放未來幾天
          </span>
          {mode === "rolling" && (
            <select
              aria-label="自動開放天數"
              value={days}
              disabled={!canManage || locked}
              onChange={(event) => setDays(Number(event.target.value))}
              className="mt-1.5 min-h-9 w-full rounded-lg border border-earth-300 bg-white px-2.5 py-1 text-sm text-earth-800 disabled:opacity-60"
            >
              {[7, 14, 21, 30, 60, 90].map((value) => (
                <option key={value} value={value}>
                  {value} 天
                </option>
              ))}
            </select>
          )}
        </label>
      </fieldset>}
      {canManage && expanded && (
        <div className={`${direct ? styles.indented : ""} mt-2 flex flex-wrap justify-end gap-2`}>
          {direct && <button type="button" disabled={locked || !dirty} onClick={cancel} className="min-h-10 rounded-lg border px-3 text-sm disabled:opacity-40">還原修改</button>}
          <button
            type="button"
            disabled={pending || (!dirty && !request.uncertain) || (mode === "fixed" && !fixedDate)}
            onClick={save}
            className="min-h-10 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-30"
          >
            {pending ? "儲存中..." : request.uncertain ? "重試確認儲存結果" : "儲存設定"}
          </button>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}

      {!direct && expanded && <p className="mt-2 text-[11px] text-earth-500">
        目前生效至 <span className="font-semibold text-earth-800">{formatDateZh(savedMode === "fixed" && savedDate ? savedDate : addTaiwanDuration(today, savedDays, "DAY"))}</span>
      </p>}
    </section>
  );
}

