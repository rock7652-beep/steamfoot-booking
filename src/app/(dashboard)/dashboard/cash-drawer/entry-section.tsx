/**
 * Cash Drawer 現金異動區塊 — PR-4
 *
 * 顯示當日的提領/補入/調整列表 + 3 個 inline 表單供 OPEN session 新增。
 *
 * 規則：
 *   - CLOSED session：只顯示列表，無新增表單（讀取 PR-2 凍結 snapshot 用）
 *   - PARTNER（無 cashDrawer.entry）：只顯示列表，無新增表單
 *   - 三種 entry 各自獨立 `<details>` disclosure，零 JS、零新依賴
 *   - 新增後 server action redirect 回原頁，revalidatePath 已在 action 內 ship
 */

import { redirect } from "next/navigation";
import type { CashDrawerEntry } from "@prisma/client";
import { SubmitButton } from "@/components/submit-button";
import { formatTWTime } from "@/lib/date-utils";
import { addCashDrawerEntryAction } from "@/server/actions/cash-drawer";

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

  async function handleAddWithdrawal(formData: FormData) {
    "use server";
    const result = await addCashDrawerEntryAction({
      sessionId,
      type: "CASH_WITHDRAWAL",
      amount: Number(formData.get("amount")),
      reason: String(formData.get("reason") ?? ""),
      note: (formData.get("note") as string) || undefined,
    });
    if (!result.success) {
      redirect(errorRedirect(result.error || "新增提領失敗"));
    }
    redirect(returnPath);
  }

  async function handleAddDeposit(formData: FormData) {
    "use server";
    const result = await addCashDrawerEntryAction({
      sessionId,
      type: "CASH_DEPOSIT",
      amount: Number(formData.get("amount")),
      reason: String(formData.get("reason") ?? ""),
      note: (formData.get("note") as string) || undefined,
    });
    if (!result.success) {
      redirect(errorRedirect(result.error || "新增補入失敗"));
    }
    redirect(returnPath);
  }

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
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-earth-900">現金異動</h2>
      <p className="mt-1 text-xs text-earth-500">
        提領 / 補入 / 調整都只影響現金抽屜結餘，不進營收或費用
      </p>

      {/* 當日異動列表 */}
      <EntriesList entries={entries} />

      {/* OPEN session 才顯示新增表單 */}
      {canAddEntry && (
        <div className="mt-6 space-y-3 border-t border-earth-100 pt-6">
          <p className="text-sm font-medium text-earth-700">新增異動</p>

          {/* 提領 */}
          <details className="rounded-lg border border-earth-200 bg-earth-50/40">
            <summary className="flex min-h-[44px] cursor-pointer items-center px-4 py-3 text-sm font-medium text-earth-800 select-none hover:bg-earth-100/60">
              ＋ 新增提領（老闆領現、存銀行等）
            </summary>
            <form action={handleAddWithdrawal} className="space-y-3 border-t border-earth-200 p-4 md:space-y-4">
              <div className="md:grid md:grid-cols-2 md:gap-4">
                <div>
                  <label className="block text-sm font-medium text-earth-700">金額（NT$）</label>
                  <input
                    type="number"
                    name="amount"
                    required
                    min={1}
                    step={1}
                    className="mt-1 block min-h-[44px] w-full rounded-lg border border-earth-300 px-3 py-2 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                    placeholder="例如 5000"
                  />
                </div>
                <div className="mt-3 md:mt-0">
                  <label className="block text-sm font-medium text-earth-700">原因（必填）</label>
                  <input
                    type="text"
                    name="reason"
                    required
                    minLength={1}
                    maxLength={100}
                    className="mt-1 block min-h-[44px] w-full rounded-lg border border-earth-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                    placeholder="例如：老闆領現存銀行"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-earth-700">備註（選填）</label>
                <textarea
                  name="note"
                  rows={2}
                  maxLength={500}
                  className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                />
              </div>
              <SubmitButton
                label="送出提領"
                className="min-h-[44px] bg-orange-600 px-5 text-base text-white hover:bg-orange-700"
              />
            </form>
          </details>

          {/* 補入 */}
          <details className="rounded-lg border border-earth-200 bg-earth-50/40">
            <summary className="flex min-h-[44px] cursor-pointer items-center px-4 py-3 text-sm font-medium text-earth-800 select-none hover:bg-earth-100/60">
              ＋ 新增補入（補找零金、保險箱補現等）
            </summary>
            <form action={handleAddDeposit} className="space-y-3 border-t border-earth-200 p-4 md:space-y-4">
              <div className="md:grid md:grid-cols-2 md:gap-4">
                <div>
                  <label className="block text-sm font-medium text-earth-700">金額（NT$）</label>
                  <input
                    type="number"
                    name="amount"
                    required
                    min={1}
                    step={1}
                    className="mt-1 block min-h-[44px] w-full rounded-lg border border-earth-300 px-3 py-2 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                    placeholder="例如 2000"
                  />
                </div>
                <div className="mt-3 md:mt-0">
                  <label className="block text-sm font-medium text-earth-700">原因（必填）</label>
                  <input
                    type="text"
                    name="reason"
                    required
                    minLength={1}
                    maxLength={100}
                    className="mt-1 block min-h-[44px] w-full rounded-lg border border-earth-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                    placeholder="例如：保險箱補找零金"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-earth-700">備註（選填）</label>
                <textarea
                  name="note"
                  rows={2}
                  maxLength={500}
                  className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                />
              </div>
              <SubmitButton
                label="送出補入"
                className="min-h-[44px] bg-green-600 px-5 text-base text-white hover:bg-green-700"
              />
            </form>
          </details>

          {/* 調整 */}
          <details className="rounded-lg border border-earth-200 bg-earth-50/40">
            <summary className="flex min-h-[44px] cursor-pointer items-center px-4 py-3 text-sm font-medium text-earth-800 select-none hover:bg-earth-100/60">
              ＋ 新增調整（盤點短少 / 溢出）
            </summary>
            <form action={handleAddAdjustment} className="space-y-3 border-t border-earth-200 p-4 md:space-y-4">
              <div>
                <p className="block text-sm font-medium text-earth-700">方向（必選）</p>
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-earth-800 md:gap-6">
                  <label className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-earth-200 bg-white px-3">
                    <input type="radio" name="direction" value="IN" required />
                    盤點溢出（+）
                  </label>
                  <label className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-earth-200 bg-white px-3">
                    <input type="radio" name="direction" value="OUT" required />
                    盤點短少（−）
                  </label>
                </div>
              </div>
              <div className="md:grid md:grid-cols-2 md:gap-4">
                <div>
                  <label className="block text-sm font-medium text-earth-700">金額（NT$）</label>
                  <input
                    type="number"
                    name="amount"
                    required
                    min={1}
                    step={1}
                    className="mt-1 block min-h-[44px] w-full rounded-lg border border-earth-300 px-3 py-2 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                    placeholder="例如 100"
                  />
                </div>
                <div className="mt-3 md:mt-0">
                  <label className="block text-sm font-medium text-earth-700">原因（必填）</label>
                  <input
                    type="text"
                    name="reason"
                    required
                    minLength={1}
                    maxLength={100}
                    className="mt-1 block min-h-[44px] w-full rounded-lg border border-earth-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                    placeholder="例如：閉店盤點短少 100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-earth-700">備註（選填）</label>
                <textarea
                  name="note"
                  rows={2}
                  maxLength={500}
                  className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                />
              </div>
              <SubmitButton
                label="送出調整"
                className="min-h-[44px] bg-earth-700 px-5 text-base text-white hover:bg-earth-800"
              />
            </form>
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
      <p className="mt-3 rounded-lg bg-earth-50/60 px-4 py-3 text-xs text-earth-500">
        今日尚無手動異動
      </p>
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
