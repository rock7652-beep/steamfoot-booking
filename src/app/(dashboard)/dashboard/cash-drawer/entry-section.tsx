/**
 * Cash Drawer 現金異動紀錄區塊 — PR-4 / PR-G5.1a
 *
 * 顯示當日所有現金異動（提領 / 補入 / 調整）列表 + 「盤點調整」次要新增表單。
 *
 * PR-G5.1a：提領 / 補入 已升級為日常操作區的大按鈕（見 cash-drawer-workspace.tsx
 * 的 DailyActionsArea），故本卡不再放這兩個新增表單，只保留：
 *   - 全部異動的唯讀列表（OPEN / CLOSED 都用）
 *   - 「盤點調整」這個較少用的校正動作（次要 `<details>` disclosure）
 *
 * 規則：
 *   - CLOSED session：只顯示列表，無新增表單（讀取凍結 snapshot 用）
 *   - PARTNER（無 cashDrawer.entry）：只顯示列表，無新增表單
 *   - 表單 JSX 共用 ./cash-entry-forms，零 JS、零新依賴
 *   - 新增後 server action redirect 回原頁，revalidatePath 已在 action 內 ship
 */

import { redirect } from "next/navigation";
import type { CashDrawerEntry } from "@prisma/client";
import { formatTWTime } from "@/lib/date-utils";
import { addCashDrawerEntryAction } from "@/server/actions/cash-drawer";
import { AdjustmentForm } from "./cash-entry-forms";

interface EntrySectionProps {
  sessionId: string;
  entries: CashDrawerEntry[];
  /** OPEN 狀態才允許新增；CLOSED 一律無 */
  canAddEntry: boolean;
  /** 表單成功 / 失敗 redirect 回的 URL（含 hash）。
   *  CashDrawerWorkspace 嵌在 cashbook 時會傳
   *  "/dashboard/cashbook#cash-drawer-workspace"，獨立 cash-drawer 頁傳
   *  "/dashboard/cash-drawer"。預設值為後者以維持既有 caller 相容。
   *  失敗時自動附 `?cashDrawerError=...` 給 <FormErrorToast /> 顯示。 */
  returnPath?: string;
}

export function EntrySection({
  sessionId,
  entries,
  canAddEntry,
  returnPath = "/dashboard/cash-drawer",
}: EntrySectionProps) {
  // 把 error message 安全地接在 returnPath 後面（保留既有 hash + query string）
  const errorRedirect = (msg: string) =>
    `${returnPath}${returnPath.includes("?") ? "&" : "?"}cashDrawerError=${encodeURIComponent(msg)}`;

  async function handleAddAdjustment(formData: FormData) {
    "use server";
    const direction = formData.get("direction");
    if (direction !== "IN" && direction !== "OUT") {
      redirect(errorRedirect("調整必須選擇方向（盤點溢出 / 盤點短少）"));
    }
    const result = await addCashDrawerEntryAction({
      sessionId,
      type: "CASH_ADJUSTMENT",
      direction,
      amount: Number(formData.get("amount")),
      reason: String(formData.get("reason") ?? ""),
      note: (formData.get("note") as string) || undefined,
    });
    if (!result.success) {
      redirect(errorRedirect(result.error || "新增調整失敗"));
    }
    redirect(returnPath);
  }

  return (
    <div className="rounded-xl border border-earth-200 bg-white p-4">
      <h2 className="text-base font-semibold text-earth-900">現金異動紀錄</h2>
      <p className="mt-1 text-xs text-earth-500">
        提領 / 補入 / 調整都只影響現金抽屜結餘，不進營收或費用
      </p>

      {/* 當日異動列表 */}
      <EntriesList entries={entries} />

      {/* OPEN session 才顯示「盤點調整」次要新增表單。
          提領 / 補入 已移到上方日常操作區的大按鈕，這裡只留較少用的盤點校正。 */}
      {canAddEntry && (
        <div className="mt-4 space-y-3 border-t border-earth-100 pt-4">
          <details className="rounded-lg border border-earth-200 bg-earth-50/40">
            <summary className="flex min-h-[44px] cursor-pointer items-center px-4 py-3 text-sm font-medium text-earth-800 select-none hover:bg-earth-100/60">
              ＋ 盤點調整（盤點短少 / 溢出）
            </summary>
            <div className="border-t border-earth-200">
              <AdjustmentForm action={handleAddAdjustment} />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 列表（read-only，OPEN / CLOSED 都用）
// ============================================================

function EntriesList({ entries }: { entries: CashDrawerEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="mt-2 text-xs text-earth-400">今日尚無手動異動</p>
    );
  }

  return (
    <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1 lg:max-h-[28rem]">
      {entries.map((entry) => (
        <EntryRow key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}

function describeEntry(entry: CashDrawerEntry): { label: string; sign: "+" | "−"; tone: string } {
  if (entry.type === "CASH_WITHDRAWAL") {
    return { label: "提領", sign: "−", tone: "text-orange-700" };
  }
  if (entry.type === "CASH_DEPOSIT") {
    return { label: "補入", sign: "+", tone: "text-green-700" };
  }
  // CASH_ADJUSTMENT
  if (entry.direction === "IN") {
    return { label: "調整（盤點溢出）", sign: "+", tone: "text-green-700" };
  }
  return { label: "調整（盤點短少）", sign: "−", tone: "text-orange-700" };
}

function EntryRow({ entry }: { entry: CashDrawerEntry }) {
  const { label, sign, tone } = describeEntry(entry);
  return (
    <li className="rounded-lg border border-earth-100 bg-white px-4 py-3 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="text-xs text-earth-400">
            {formatTWTime(entry.createdAt, { style: "short" })}
          </span>
          <span className="font-medium text-earth-800">{label}</span>
        </div>
        <span className={`text-base font-medium tabular-nums ${tone}`}>
          {sign} NT$ {entry.amount.toString()}
        </span>
      </div>
      <p className="mt-1 text-xs text-earth-600">{entry.reason}</p>
      {entry.note && (
        <p className="mt-1 whitespace-pre-wrap text-[11px] text-earth-500">{entry.note}</p>
      )}
    </li>
  );
}
