"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { migratePaperPlan } from "@/server/actions/wallet";
import { toast } from "sonner";

// ============================================================
// MigratePaperPlanDialog — 紙本舊客轉入線上（PR-C）
//
// 流程：
//   Step 1 (form)   → 填寫紙本卡資料
//   Step 2 (preview)→ 顯示 5 行確認（含未來服務金額單價）→ 修改 / 確認送出
//   Step 3 (toast)  → 成功 / 失敗 feedback；成功時關閉 + router.refresh()
//
// 為何要二段式：
//   單堂金額分母是「原始總堂數」(22) 不是「剩餘堂數」(10)，
//   一旦送出就鎖進 wallet.purchasedPrice + wallet.totalSessions 快照，
//   後續報表會用此快照算「店長服務金額試算」。錯了只能刪掉重來。
//   故設預覽 step 讓店長一眼看到完整快照，確定無誤再送出。
//
// 權限/防呆：
//   - Server action 端 requirePermission("wallet.adjust") + role === OWNER/ADMIN
//   - UI 端額外靠 page.tsx 在 canAdjustWallet && (OWNER/ADMIN) 才 render 按鈕
//   - 表單即時擋：usedSessions > totalSessions、負數、空 plan
//   - 預覽頁送出後 useTransition + isPending 立即 disable 防雙擊
// ============================================================

interface Plan {
  id: string;
  name: string;
  category: string;
  /** 方案定價（純參考用，紙本舊客實際金額由店長手填） */
  price: number;
  /** 方案預設總堂數（純參考用，紙本卡實際總堂數由店長手填） */
  sessionCount: number;
}

interface Props {
  customerId: string;
  plans: Plan[];
}

type Step = "form" | "preview";

interface FormState {
  planId: string;
  originalAmount: string; // 用 string 避免 number 控件清空變 NaN
  totalSessions: string;
  usedSessions: string;
  expiryDate: string;
  note: string;
}

const INITIAL_FORM: FormState = {
  planId: "",
  originalAmount: "",
  totalSessions: "",
  usedSessions: "0",
  expiryDate: "",
  note: "",
};

export function MigratePaperPlanDialog({ customerId, plans }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openDialog() {
    setOpen(true);
    setStep("form");
    setForm(INITIAL_FORM);
    setError(null);
  }

  function closeDialog() {
    if (isPending) return; // 送出中不可關閉
    setOpen(false);
  }

  // ── 解析數字（form 用 string 儲存以容忍清空狀態）──
  const parsed = useMemo(() => {
    const originalAmount = parseInt(form.originalAmount, 10);
    const totalSessions = parseInt(form.totalSessions, 10);
    const usedSessions = parseInt(form.usedSessions || "0", 10);
    return {
      originalAmount: Number.isFinite(originalAmount) ? originalAmount : null,
      totalSessions: Number.isFinite(totalSessions) ? totalSessions : null,
      usedSessions: Number.isFinite(usedSessions) ? usedSessions : null,
    };
  }, [form.originalAmount, form.totalSessions, form.usedSessions]);

  // ── Step 1 → Step 2 之前的即時驗證 ──
  const formError: string | null = useMemo(() => {
    if (!form.planId) return "請選擇對應的課程方案";
    if (parsed.originalAmount === null || parsed.originalAmount < 0) {
      return "請填寫原始實收金額（≥ 0）";
    }
    if (parsed.totalSessions === null || parsed.totalSessions < 1) {
      return "請填寫原始總堂數（≥ 1）";
    }
    if (parsed.usedSessions === null || parsed.usedSessions < 0) {
      return "已使用堂數需為 0 或正整數";
    }
    if (parsed.usedSessions > parsed.totalSessions) {
      return `已使用堂數（${parsed.usedSessions}）不可超過原始總堂數（${parsed.totalSessions}）`;
    }
    if (form.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.expiryDate)) {
      return "到期日格式錯誤";
    }
    return null;
  }, [form.planId, form.expiryDate, parsed]);

  // ── 預覽 5 行 ──
  const preview = useMemo(() => {
    if (
      parsed.originalAmount === null ||
      parsed.totalSessions === null ||
      parsed.usedSessions === null
    ) {
      return null;
    }
    const remaining = parsed.totalSessions - parsed.usedSessions;
    // 單堂金額 = 原始實收金額 ÷ 原始總堂數（不是 ÷ 剩餘）
    const unitPrice =
      parsed.totalSessions > 0
        ? parsed.originalAmount / parsed.totalSessions
        : 0;
    return {
      originalAmount: parsed.originalAmount,
      totalSessions: parsed.totalSessions,
      usedSessions: parsed.usedSessions,
      remaining,
      unitPrice,
    };
  }, [parsed]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === form.planId) ?? null,
    [plans, form.planId],
  );

  function handleNext() {
    if (formError) {
      setError(formError);
      return;
    }
    setError(null);
    setStep("preview");
  }

  function handleBack() {
    setError(null);
    setStep("form");
  }

  function handleSubmit() {
    if (formError || !preview) {
      setError(formError ?? "資料不完整");
      return;
    }
    startTransition(async () => {
      const result = await migratePaperPlan({
        customerId,
        planId: form.planId,
        originalAmount: preview.originalAmount,
        totalSessions: preview.totalSessions,
        usedSessions: preview.usedSessions,
        expiryDate: form.expiryDate || undefined,
        note: form.note.trim() || undefined,
      });

      if (result.success) {
        toast.success(
          `紙本轉入完成：${selectedPlan?.name ?? "方案"} ${preview.totalSessions} 堂，` +
            `線上可用剩餘 ${result.data.remainingSessions} 堂`,
        );
        setOpen(false);
        setForm(INITIAL_FORM);
        setStep("form");
        router.refresh();
      } else {
        setError(result.error ?? "轉入失敗，請稍後再試");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
      >
        紙本舊客轉入
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-earth-100 px-5 py-3">
              <h3 className="text-base font-semibold text-earth-900">
                {step === "form" ? "紙本舊客轉入" : "確認紙本轉入內容"}
              </h3>
              <button
                type="button"
                onClick={closeDialog}
                disabled={isPending}
                className="text-earth-400 hover:text-earth-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              {step === "form" && (
                <FormStep
                  form={form}
                  setForm={setForm}
                  plans={plans}
                  parsedError={formError}
                  showError={error}
                />
              )}
              {step === "preview" && preview && (
                <PreviewStep
                  selectedPlanName={selectedPlan?.name ?? "—"}
                  preview={preview}
                  expiryDate={form.expiryDate}
                  note={form.note}
                  errorMessage={error}
                />
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-earth-100 px-5 py-3">
              {step === "form" && (
                <>
                  <button
                    type="button"
                    onClick={closeDialog}
                    className="rounded-lg px-3 py-1.5 text-sm text-earth-500 hover:text-earth-700"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!!formError}
                    className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    下一步：預覽
                  </button>
                </>
              )}
              {step === "preview" && (
                <>
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={isPending}
                    className="rounded-lg px-3 py-1.5 text-sm text-earth-500 hover:text-earth-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    修改
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isPending}
                    className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? "送出中…" : "確認送出"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// Step 1: 表單
// ============================================================

interface FormStepProps {
  form: FormState;
  setForm: (next: FormState) => void;
  plans: Plan[];
  parsedError: string | null;
  showError: string | null;
}

function FormStep({ form, setForm, plans, parsedError, showError }: FormStepProps) {
  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm({ ...form, [key]: value });
  }

  return (
    <div className="space-y-3">
      {/* 警語 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <div className="font-medium">紙本舊客一次性轉入</div>
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-800">
          <li>此操作 <b>不會列入營收</b>、<b>不會進現金帳</b>、<b>不會發推薦獎勵</b></li>
          <li>金額分母固定為「<b>原始總堂數</b>」，不是「剩餘堂數」</li>
          <li>送出後 wallet 將鎖定快照；修正只能透過刪除重建</li>
        </ul>
      </div>

      {/* Plan */}
      <div>
        <label className="text-xs text-earth-500">對應線上方案 *</label>
        <select
          value={form.planId}
          onChange={(e) => update("planId", e.target.value)}
          className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        >
          <option value="">— 請選擇 —</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（定價 {p.price} 元 / {p.sessionCount} 堂）
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-earth-400">
          僅用於分類與報表；紙本卡的實際金額與堂數請手填下方欄位。
        </p>
      </div>

      {/* Original amount + Total sessions */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-earth-500">原始實收金額（元）*</label>
          <input
            type="number"
            min={0}
            step={1}
            value={form.originalAmount}
            onChange={(e) => update("originalAmount", e.target.value)}
            placeholder="例：12000"
            className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="text-xs text-earth-500">原始總堂數 *</label>
          <input
            type="number"
            min={1}
            step={1}
            value={form.totalSessions}
            onChange={(e) => update("totalSessions", e.target.value)}
            placeholder="例：22"
            className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Used sessions + Expiry */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-earth-500">轉入前已使用堂數</label>
          <input
            type="number"
            min={0}
            step={1}
            value={form.usedSessions}
            onChange={(e) => update("usedSessions", e.target.value)}
            placeholder="0"
            className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <p className="mt-1 text-[11px] text-earth-400">
            紙本卡上已劃掉 / 已用的格子數。0 = 全新未開。
          </p>
        </div>
        <div>
          <label className="text-xs text-earth-500">到期日（選填）</label>
          <input
            type="date"
            value={form.expiryDate}
            onChange={(e) => update("expiryDate", e.target.value)}
            className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <p className="mt-1 text-[11px] text-earth-400">空白 = 無期限；可填過去（已過期）日期。</p>
        </div>
      </div>

      {/* Note */}
      <div>
        <label className="text-xs text-earth-500">備註（選填）</label>
        <textarea
          rows={2}
          value={form.note}
          onChange={(e) => update("note", e.target.value)}
          placeholder="例：竹北紙本卡 #88 / 原業務員 XXX"
          maxLength={500}
          className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>

      {/* 即時錯誤（送出失敗用 showError；其餘用 parsedError 在按鈕 hover 時提示） */}
      {(showError || parsedError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {showError ?? parsedError}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Step 2: 預覽
// ============================================================

interface PreviewStepProps {
  selectedPlanName: string;
  preview: {
    originalAmount: number;
    totalSessions: number;
    usedSessions: number;
    remaining: number;
    unitPrice: number;
  };
  expiryDate: string;
  note: string;
  errorMessage: string | null;
}

function PreviewStep({
  selectedPlanName,
  preview,
  expiryDate,
  note,
  errorMessage,
}: PreviewStepProps) {
  // 千分位顯示
  const fmt = (n: number) => n.toLocaleString("zh-TW");
  // 單堂金額以原樣字串顯示，避免 545.4545454 整列文字爆開
  const unitPriceStr = preview.unitPrice.toLocaleString("zh-TW", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="space-y-3">
      <div className="text-xs text-earth-500">
        對應方案：<span className="font-medium text-earth-800">{selectedPlanName}</span>
      </div>

      {/* 5 行 — 用 grid 對齊；單堂金額用顯眼背景強化 */}
      <div className="rounded-lg border border-earth-200 bg-earth-50/40 p-4">
        <dl className="space-y-1.5 text-sm">
          <Row label="原始實收金額" value={`${fmt(preview.originalAmount)} 元`} />
          <Row label="原始總堂數" value={`${fmt(preview.totalSessions)} 堂`} />
          <Row
            label="已使用 / 已註銷"
            value={`${fmt(preview.usedSessions)} 堂`}
          />
          <Row
            label="線上可用剩餘堂數"
            value={`${fmt(preview.remaining)} 堂`}
          />
          <div className="-mx-2 mt-2 rounded-md bg-amber-100 px-2 py-1.5">
            <Row
              label="未來服務金額單價"
              value={`${unitPriceStr} 元 / 堂`}
              emphasis
            />
          </div>
        </dl>
      </div>

      {/* 黃色警告：分母是 22 不是 10 */}
      <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <div className="font-medium">⚠️ 請確認金額分母</div>
        <p className="mt-0.5">
          單堂金額 = <b>{fmt(preview.originalAmount)} ÷ {fmt(preview.totalSessions)}</b>
          （原始總堂數），<u>不是</u>除以剩餘 {fmt(preview.remaining)} 堂。
          送出後此快照將鎖入 wallet，影響日後「店長服務金額試算」。
        </p>
      </div>

      {/* 其他資訊 */}
      <div className="rounded-lg border border-earth-100 bg-white px-3 py-2 text-[11px] text-earth-500">
        <div>到期日：<span className="text-earth-800">{expiryDate || "無期限"}</span></div>
        {note && <div className="mt-0.5">備註：<span className="text-earth-800">{note}</span></div>}
        <div className="mt-1 text-earth-400">
          此操作不會列入營收 / 不會進現金帳 / 不會發推薦獎勵。
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {errorMessage}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={emphasis ? "text-sm font-medium text-amber-900" : "text-earth-500"}>
        {label}
      </dt>
      <dd
        className={
          emphasis
            ? "text-base font-semibold tabular-nums text-amber-900"
            : "tabular-nums text-earth-900"
        }
      >
        {value}
      </dd>
    </div>
  );
}
