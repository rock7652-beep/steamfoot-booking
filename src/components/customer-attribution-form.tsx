"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { updateCustomerAssignment, searchReferrerCandidates } from "@/server/actions/customer";
type StaffOption = {id:string;displayName:string};
type ReferrerCandidate = { id: string; name: string; phoneMasked: string; kind?: "CUSTOMER" | "COACH"; kindLabel?: string };

export function CustomerAttributionForm({
  customerId,
  currentStaffId,
  currentSponsor,
  staffOptions,
  canAssign,
  readOnly = false,
  onSaved,
  saveAction = updateCustomerAssignment,
  searchAction = searchReferrerCandidates,
}: {
  customerId: string;
  currentStaffId: string | null;
  currentSponsor: { id: string; name: string } | null;
  staffOptions: StaffOption[];
  canAssign: boolean;
  readOnly?: boolean;
  onSaved?: () => void;
  saveAction?: typeof updateCustomerAssignment;
  searchAction?: (query: string, excludeCustomerId?: string) => Promise<{ success: true; data: ReferrerCandidate[] } | { success: false; error?: string }>;
}) {
  const [staffId, setStaffId] = useState<string>(currentStaffId ?? "");
  const [sponsor, setSponsor] = useState<{ id: string; name: string; kind?: "CUSTOMER" | "COACH"; kindLabel?: string } | null>(
    currentSponsor,
  );
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<ReferrerCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchError, setSearchError] = useState("");

  const dirty =
    staffId !== (currentStaffId ?? "") ||
    (sponsor?.id ?? null) !== (currentSponsor?.id ?? null);

  // 推薦人搜尋：姓名或手機（部分即可），debounce 300ms 避免逐字打 query。
  // sponsor 已選或 query 為空時不查；以 active flag 丟棄過期回應避免 race。
  useEffect(() => {
    const q = query.trim();
    if (sponsor || q.length < 1 || !canAssign || readOnly) return;
    let active = true;
    const t = setTimeout(async () => {
      try {
        const result = await searchAction(q, customerId);
        if (!active) return;
        setSearching(false);
        setSearched(true);
        if (result.success) setCandidates(result.data);
        else setSearchError(result.error ?? "搜尋失敗，請重試");
      } catch {
        if (active) { setSearching(false); setSearchError("搜尋失敗，請重新輸入重試"); }
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, sponsor, customerId, searchAction, canAssign, readOnly]);

  function selectCandidate(c: ReferrerCandidate) {
    setSponsor({ id: c.id, name: c.name, kind: c.kind, kindLabel: c.kindLabel });
    setQuery("");
    setCandidates([]);
    setSearched(false);
    setSearching(false);
    setSearchError("");
  }

  async function handleSave() {
    if (saving || readOnly || !canAssign) return;
    if (!staffId) {
      toast.error("請選擇歸屬店長");
      return;
    }
    setSaving(true);
    try {
      const result = await saveAction({
        customerId,
        assignedStaffId: staffId,
        referredByCustomerId: sponsor?.id ?? null,
      });
      if (result.success) {
        toast.success("已更新歸屬設定");
        onSaved?.();
      } else {
        toast.error(result.error ?? "儲存失敗");
      }
    } catch {
      toast.error("儲存失敗，已保留選取內容，請重試");
    } finally {
      setSaving(false);
    }
  }

  if (!canAssign || readOnly) {
    return (
      <div className="space-y-1 text-xs text-earth-600">
        <div>
          <span className="text-earth-500">歸屬店長：</span>
          <span className="font-medium text-earth-800">
            {staffOptions.find((s) => s.id === currentStaffId)?.displayName ?? "未指派"}
          </span>
        </div>
        <div>
          <span className="text-earth-500">引薦人：</span>
          <span className="text-earth-800">{currentSponsor?.name ?? "—"}</span>
        </div>
        <p className="pt-1 text-[11px] text-earth-400">
          {readOnly ? "查看模式下不可修改歸屬設定" : "您沒有指派權限，無法修改"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-earth-600">
          歸屬店長 <span className="text-red-500">*</span>
        </label>
        <select
          aria-label="歸屬店長"
          disabled={saving}
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          className="mt-1 w-full rounded-md border border-earth-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">請選擇店長</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-earth-600">
          引薦人（選填）
        </label>
        {sponsor ? (
          <div className="mt-1 flex min-h-12 items-center justify-between rounded-xl border border-earth-200 bg-earth-50 px-3 py-2">
            <span className="flex items-center gap-2 text-sm text-earth-800">
              <span>{sponsor.name}</span>
              {sponsor.kindLabel && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sponsor.kind === "COACH" ? "bg-gold-100 text-gold-800" : "bg-primary-50 text-primary-700"}`}>
                  {sponsor.kindLabel}
                </span>
              )}
            </span>
            <button
              type="button"
              disabled={saving}
              onClick={() => setSponsor(null)}
              className="text-[11px] text-earth-500 hover:text-red-600"
            >
              清除
            </button>
          </div>
        ) : (
          <div className="mt-1 space-y-1.5">
            <input
              type="text"
              value={query}
              disabled={saving}
              onChange={(e) => {setQuery(e.target.value);setCandidates([]);setSearched(false);setSearching(!!e.target.value.trim());setSearchError("");}}
              placeholder="輸入姓名或電話搜尋顧客／教練"
              className="w-full rounded-md border border-earth-300 bg-white px-2 py-1.5 text-sm"
            />
            {searchError ? <p role="alert" className="text-sm text-red-700">{searchError}</p> : searching ? (
              <p className="text-[11px] text-earth-400">查詢中…</p>
            ) : candidates.length > 0 ? (
              <ul className="max-h-40 divide-y divide-earth-100 overflow-auto rounded-xl border border-earth-200 bg-white">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => selectCandidate(c)}
                      className="flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-earth-50"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm text-earth-800">{c.name}</span>
                        {c.kindLabel && (
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${c.kind === "COACH" ? "bg-gold-100 text-gold-800" : "bg-primary-50 text-primary-700"}`}>
                            {c.kindLabel}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums text-[11px] text-earth-500">
                        {c.phoneMasked}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : searched && query.trim() ? (
              <p className="text-[11px] text-amber-700">找不到符合的顧客或已綁定會員身份的教練</p>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving || !staffId}
          className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "儲存中…" : "儲存歸屬"}
        </button>
      </div>
    </div>
  );
}
