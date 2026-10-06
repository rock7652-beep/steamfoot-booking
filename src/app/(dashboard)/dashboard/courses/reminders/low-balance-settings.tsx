"use client";
import { NotificationSwitch } from "@/components/admin/notification-switch";
import { useMemo, useRef, useState, useTransition } from "react";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { saveCoursePlanReminderSetting } from "@/server/actions/course-plan-reminders";
import { courseLowBalanceBody } from "@/lib/course-low-balance";
import { LineCardPreview } from "../../reminders/line-card-preview";
import { coursePlanReminderSchema } from "@/lib/course-plan-reminders";

type Plan = {
  id: string;
  name: string;
  unit: string;
  isActive: boolean;
  lowBalanceEnabled: boolean;
  lowBalanceThreshold: number | null;
  expiry?: { enabled: boolean; days: number[] };
};
type Draft = { enabled: boolean; threshold: string; expiryEnabled: boolean; expiryDays: string };

const DEFAULT_DRAFT: Draft = {
  enabled: false,
  threshold: "",
  expiryEnabled: true,
  expiryDays: "14, 7",
};

const same = (a: Draft, b: Draft) =>
  a.enabled === b.enabled &&
  a.threshold === b.threshold &&
  a.expiryEnabled === b.expiryEnabled &&
  a.expiryDays === b.expiryDays;

const isDefault = (draft: Draft) => same(draft, DEFAULT_DRAFT);

function normalizedDraft(plan: Plan): Draft {
  return {
    enabled: plan.lowBalanceEnabled,
    threshold: plan.lowBalanceThreshold?.toString() ?? "",
    expiryEnabled: plan.expiry?.enabled ?? true,
    expiryDays: (plan.expiry?.days ?? [14, 7]).join(", "),
  };
}

function balanceSummary(draft: Draft, unit: string) {
  if (!draft.enabled) return "關閉";
  return draft.threshold ? `剩 ${draft.threshold} ${unit}／用完提醒` : "已開啟";
}

function expirySummary(draft: Draft) {
  if (!draft.expiryEnabled) return "關閉";
  return draft.expiryDays ? `${draft.expiryDays.replace(/,\s*/g, "、")} 天前` : "已開啟";
}

export function CourseLowBalanceSettings({ plans, music = false }: { plans: Plan[]; music?: boolean }) {
  const initial = () => Object.fromEntries(plans.map(plan => [plan.id, normalizedDraft(plan)]));
  const [saved, setSaved] = useState<Record<string, Draft>>(initial);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const saving = useRef(false);

  const changedIds = useMemo(
    () => new Set(plans.filter(plan => !same(drafts[plan.id], saved[plan.id])).map(plan => plan.id)),
    [drafts, plans, saved],
  );
  const changes = plans.filter(plan => changedIds.has(plan.id));
  useSettingsPanelGuard(changes.length > 0, pending);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return [...plans]
      .filter(plan => {
        const current = saved[plan.id];
        const matchesQuery = plan.name.toLocaleLowerCase().includes(q);
        if (!matchesQuery) return false;
        if (filter === "enabled") return current.enabled || current.expiryEnabled;
        if (filter === "custom") return !isDefault(current);
        if (filter === "inactive") return !plan.isActive;
        if (filter === "changed") return changedIds.has(plan.id);
        return true;
      })
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        const aCustom = !isDefault(saved[a.id]);
        const bCustom = !isDefault(saved[b.id]);
        if (aCustom !== bCustom) return aCustom ? -1 : 1;
        return a.name.localeCompare(b.name, "zh-TW");
      });
  }, [changedIds, filter, plans, query, saved]);

  const pages = Math.max(1, Math.ceil(filtered.length / 15));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 15, currentPage * 15);

  function update(id: string, patch: Partial<Draft>) {
    setDrafts(previous => ({ ...previous, [id]: { ...previous[id], ...patch } }));
    setMessage("");
  }

  function parse(plan: Plan) {
    return coursePlanReminderSchema.safeParse({
      planId: plan.id,
      enabled: drafts[plan.id].enabled,
      threshold: drafts[plan.id].threshold === "" ? null : Number(drafts[plan.id].threshold),
      expiry: {
        enabled: drafts[plan.id].expiryEnabled,
        days: drafts[plan.id].expiryDays
          .split(/[,，、\s]+/)
          .filter(Boolean)
          .map(Number),
      },
    });
  }

  async function persist(plan: Plan) {
    const parsed = parse(plan);
    if (!parsed.success) {
      setMessage(`「${plan.name}」請確認剩餘門檻為 0–1000000 的整數，到期天數為 1–365（最多 6 次）。`);
      return false;
    }
    const result = await saveCoursePlanReminderSetting(parsed.data);
    if (!result.success) {
      setMessage(`「${plan.name}」：${result.error}`);
      return false;
    }
    const value: Draft = {
      enabled: parsed.data.enabled,
      threshold: parsed.data.threshold?.toString() ?? "",
      expiryEnabled: parsed.data.expiry.enabled,
      expiryDays: parsed.data.expiry.days.join(", "),
    };
    setSaved(previous => ({ ...previous, [plan.id]: value }));
    setDrafts(previous => ({ ...previous, [plan.id]: value }));
    return true;
  }

  function saveOne(plan: Plan) {
    if (saving.current || pending || !changedIds.has(plan.id)) return;
    saving.current = true;
    start(async () => {
      try {
        const ok = await persist(plan);
        if (ok) {
          setEditing(null);
          setPreview(null);
          setMessage(`「${plan.name}」已儲存`);
        }
      } catch {
        setMessage("連線失敗，修改已保留，請重試。");
      } finally {
        saving.current = false;
      }
    });
  }

  function saveAll() {
    if (saving.current || !changes.length) return;
    const invalid = changes.find(plan => !parse(plan).success);
    if (invalid) {
      setMessage(`「${invalid.name}」請確認剩餘門檻與到期提醒天數。`);
      return;
    }
    saving.current = true;
    start(async () => {
      let count = 0;
      try {
        for (const plan of changes) {
          if (!(await persist(plan))) {
            setMessage(`已儲存 ${count} 項；其餘修改已保留。`);
            return;
          }
          count++;
        }
        setEditing(null);
        setPreview(null);
        setMessage(`已儲存 ${count} 項設定`);
      } catch {
        setMessage(`已儲存 ${count} 項；其餘修改已保留，請重試。`);
      } finally {
        saving.current = false;
      }
    });
  }

  function cancelOne(plan: Plan) {
    setDrafts(previous => ({ ...previous, [plan.id]: saved[plan.id] }));
    setEditing(null);
    setPreview(null);
    setMessage("");
  }

  function restoreDefault(id: string) {
    setDrafts(previous => ({ ...previous, [id]: { ...DEFAULT_DRAFT } }));
    setMessage("");
  }

  function applyDefault(kind: "all" | "balance" | "expiry") {
    const ids = new Set(filtered.map(plan => plan.id));
    setDrafts(previous => {
      const next = { ...previous };
      plans.forEach(plan => {
        if (!ids.has(plan.id)) return;
        const current = next[plan.id];
        next[plan.id] =
          kind === "balance"
            ? { ...current, enabled: DEFAULT_DRAFT.enabled, threshold: DEFAULT_DRAFT.threshold }
            : kind === "expiry"
              ? { ...current, expiryEnabled: DEFAULT_DRAFT.expiryEnabled, expiryDays: DEFAULT_DRAFT.expiryDays }
              : { ...DEFAULT_DRAFT };
      });
      return next;
    });
    setMessage(`已套用到目前篩選結果，共 ${filtered.length} 個方案；尚未儲存。`);
    setBulkOpen(false);
  }

  return (
    <details open className="rounded-xl border border-earth-200 bg-white">
      <summary className="flex min-h-12 cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div>
          <h2 className="text-sm font-semibold text-primary-900">方案提醒設定</h2>
          <p className="mt-0.5 text-xs text-earth-500">每個方案可獨立設定剩餘額度與到期提醒</p>
        </div>
        <span className="text-sm tabular-nums text-earth-600">
          共 {plans.length} 項{changes.length > 0 ? ` · ${changes.length} 項未儲存` : ""}
        </span>
      </summary>

      <div className="flex max-h-[64vh] min-h-0 flex-col border-t border-earth-100">
        <div className="flex shrink-0 flex-wrap items-center gap-2 p-3">
          <input
            aria-label="搜尋提醒方案"
            placeholder="搜尋方案名稱"
            value={query}
            onChange={event => { setQuery(event.target.value); setPage(1); }}
            className="min-h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm"
          />
          <select
            aria-label="篩選提醒方案"
            value={filter}
            onChange={event => { setFilter(event.target.value); setPage(1); }}
            className="min-h-10 rounded-lg border px-3 text-sm"
          >
            <option value="all">全部方案</option>
            <option value="enabled">已開啟提醒</option>
            <option value="custom">自訂提醒</option>
            <option value="changed">僅看已修改</option>
            <option value="inactive">已下架</option>
          </select>
          <button
            type="button"
            onClick={() => setBulkOpen(value => !value)}
            className="min-h-10 rounded-lg border border-earth-200 px-3 text-sm font-medium text-primary-700"
          >
            批次套用
          </button>
        </div>

        {bulkOpen ? (
          <div className="shrink-0 border-t border-earth-100 bg-earth-50 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-earth-600">套用到目前篩選結果：{filtered.length} 個方案</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => applyDefault("balance")} className="min-h-9 rounded-lg border bg-white px-3 text-sm">只套用剩餘提醒預設</button>
                <button type="button" onClick={() => applyDefault("expiry")} className="min-h-9 rounded-lg border bg-white px-3 text-sm">只套用到期提醒預設</button>
                <button type="button" onClick={() => applyDefault("all")} className="min-h-9 rounded-lg border bg-white px-3 text-sm font-medium text-primary-700">全部恢復預設</button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!visible.length ? (
            <p className="p-3 text-sm text-earth-600">
              {plans.length ? "沒有符合條件的方案。" : music ? "建立堂數方案後，可在此設定提醒。" : "建立點數／堂數方案後，可在此設定提醒。"}
            </p>
          ) : null}

          <div className="sticky top-0 z-10 hidden grid-cols-[minmax(180px,1fr)_180px_200px_96px] gap-3 border-y bg-earth-50 px-3 py-2 text-xs font-medium text-earth-600 lg:grid">
            <span>方案</span>
            <span>剩餘提醒</span>
            <span>到期提醒</span>
            <span className="text-right">操作</span>
          </div>

          {visible.map(plan => {
            const draft = drafts[plan.id];
            const unit = plan.unit === "SESSION" ? "堂" : "點";
            const changed = changedIds.has(plan.id);
            const custom = !isDefault(saved[plan.id]);
            const open = editing === plan.id;

            return (
              <div key={plan.id} className={`border-t border-earth-100 ${plan.isActive ? "" : "bg-earth-50/60"}`}>
                <div className="grid min-h-12 items-center gap-3 px-3 py-2 lg:grid-cols-[minmax(180px,1fr)_180px_200px_96px]">
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-medium ${plan.isActive ? "text-primary-900" : "text-earth-500"}`}>{plan.name}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-earth-500">
                      <span>{custom ? "自訂" : "預設"}</span>
                      {!plan.isActive ? <span>已下架</span> : null}
                      {changed ? <span className="text-amber-700">未儲存</span> : null}
                    </div>
                  </div>
                  <p className="text-sm tabular-nums text-earth-700">{balanceSummary(draft, unit)}</p>
                  <p className="text-sm tabular-nums text-earth-700">{expirySummary(draft)}</p>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => { setEditing(open ? null : plan.id); setPreview(null); }}
                      className="min-h-9 min-w-20 rounded-lg border border-earth-200 px-3 text-sm font-medium text-primary-700 hover:bg-earth-50"
                    >
                      {open ? "收起" : "修改"}
                    </button>
                  </div>
                </div>

                {open ? (
                  <fieldset disabled={pending} className="border-t border-earth-100 bg-earth-50/40 px-3 py-3">
                    <div className="grid gap-3 lg:grid-cols-2">
                      <section className="rounded-lg border border-earth-200 bg-white p-3">
                        <label className="flex min-h-10 items-center justify-between gap-3">
                          <span className="text-sm font-medium text-earth-800">剩餘額度提醒</span>
                          <NotificationSwitch aria-label={`${plan.name} 啟用提醒`} checked={draft.enabled} onChange={event => update(plan.id, { enabled: event.target.checked })} />
                        </label>
                        {draft.enabled ? (
                          <label className="mt-2 flex items-center gap-2 text-sm text-earth-600">
                            剩
                            <input
                              aria-label={`${plan.name} 提醒門檻`}
                              type="number"
                              min="0"
                              max="1000000"
                              step="1"
                              value={draft.threshold}
                              onChange={event => update(plan.id, { threshold: event.target.value })}
                              className="min-h-10 w-24 rounded-lg border border-earth-300 px-3 text-sm tabular-nums"
                            />
                            {unit}時提醒
                          </label>
                        ) : <p className="mt-1 text-xs text-earth-400">目前關閉，不會發送剩餘額度提醒。</p>}
                      </section>

                      <section className="rounded-lg border border-earth-200 bg-white p-3">
                        <label className="flex min-h-10 items-center justify-between gap-3">
                          <span className="text-sm font-medium text-earth-800">到期提醒</span>
                          <NotificationSwitch aria-label={`${plan.name} 啟用到期提醒`} checked={draft.expiryEnabled} onChange={event => update(plan.id, { expiryEnabled: event.target.checked })} />
                        </label>
                        {draft.expiryEnabled ? (
                          <label className="mt-2 flex items-center gap-2 text-sm text-earth-600">
                            提前
                            <input
                              aria-label={`${plan.name} 到期提醒天數`}
                              type="text"
                              value={draft.expiryDays}
                              placeholder="14, 7"
                              onChange={event => update(plan.id, { expiryDays: event.target.value })}
                              className="min-h-10 w-36 rounded-lg border border-earth-300 px-3 text-sm tabular-nums"
                            />
                            天提醒
                          </label>
                        ) : <p className="mt-1 text-xs text-earth-400">目前關閉，原本天數會保留。</p>}
                      </section>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => restoreDefault(plan.id)} className="min-h-9 rounded-lg border bg-white px-3 text-sm">恢復預設</button>
                        <button type="button" onClick={() => setPreview(preview === plan.id ? null : plan.id)} className="min-h-9 rounded-lg border bg-white px-3 text-sm text-primary-700">
                          {preview === plan.id ? "收起預覽" : "查看預覽"}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => cancelOne(plan)} className="min-h-10 min-w-20 rounded-lg border bg-white px-3 text-sm">取消</button>
                        <button type="button" disabled={!changed || pending} onClick={() => saveOne(plan)} className="min-h-10 min-w-20 rounded-lg bg-primary-700 px-3 text-sm font-medium text-white disabled:opacity-40">儲存</button>
                      </div>
                    </div>

                    {preview === plan.id ? (
                      <div className="mt-3 grid gap-3 border-t border-earth-100 pt-3 md:grid-cols-2">
                        <LineCardPreview title="方案可用額度提醒" subtitle="示意資料，非真實發送" actions={[{ label: "查看我的方案", variant: "primary" }, { label: "立即預約" }, { label: "購買／續購方案" }, {label:"諮詢店長",variant:"link"}, { label: "停止／管理此類提醒", variant: "link" }]}>
                          {courseLowBalanceBody(plan.name, 5, 3, plan.unit)}
                        </LineCardPreview>
                        <LineCardPreview title="方案即將到期提醒" subtitle={`設定：到期前 ${draft.expiryDays || "尚未填寫"} 天`} actions={[{ label: "查看方案與期限" },{label:"立即預約"},{label:"購買／續購方案"},{label:"諮詢店長",variant:"link"}]}>
                          <p>{plan.name}</p>
                          <p>示意：剩餘 5 {unit}／占用 3 {unit}／可用 2 {unit}。</p>
                          <p>通知會帶入該張方案的實際到期日。</p>
                        </LineCardPreview>
                      </div>
                    ) : null}
                  </fieldset>
                ) : null}
              </div>
            );
          })}

          {pages > 1 ? (
            <nav aria-label="提醒方案分頁" className="flex items-center justify-between gap-2 border-t p-2.5">
              <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="min-h-9 rounded border px-3 text-sm disabled:opacity-40">上一頁</button>
              <span className="text-sm tabular-nums">{currentPage}／{pages} 頁 · {filtered.length} 項</span>
              <button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="min-h-9 rounded border px-3 text-sm disabled:opacity-40">下一頁</button>
            </nav>
          ) : null}
        </div>

        <div className="shrink-0 border-t bg-white p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-sm text-primary-800">{message || (changes.length ? `${changes.length} 項尚未儲存` : "所有設定已儲存")}</p>
            {discard ? (
              <div role="alert" className="flex flex-wrap items-center gap-2">
                <span className="text-sm">捨棄全部未儲存修改？</span>
                <button type="button" className="min-h-9 rounded border px-3 text-sm" onClick={() => setDiscard(false)}>繼續編輯</button>
                <button type="button" className="min-h-9 rounded border px-3 text-sm" onClick={() => { setDrafts(saved); setDiscard(false); setEditing(null); setPreview(null); setMessage(""); }}>捨棄修改</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button type="button" disabled={pending || !changes.length} onClick={() => setDiscard(true)} className="min-h-10 rounded-lg border px-4 text-sm disabled:opacity-40">取消全部修改</button>
                <button type="button" disabled={pending || !changes.length} onClick={saveAll} className="min-h-10 rounded-lg bg-primary-700 px-4 text-sm text-white disabled:opacity-40">{pending ? "儲存中…" : "儲存全部修改"}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
