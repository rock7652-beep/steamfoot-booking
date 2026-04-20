"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";

/**
 * 顧客列表 toolbar — 桌機版重構
 *
 * 一列完成：搜尋 / 狀態 / 來店 / 推薦 / 直屬店長 / 排序 / 清除。
 * 不開 modal、不跳頁；`useRouter.replace()` 更新 URL 後 Next 會自動 refetch server component。
 *
 * 切換任一篩選或排序都會重置 `page=1`，避免頁碼殘留造成空結果。
 */

interface StaffOption {
  id: string;
  displayName: string;
}

interface Props {
  staffOptions: StaffOption[];
  /** 語意 basePath（例：`/dashboard/customers`）— 僅供「清除篩選」Link 使用，DashboardLink 會自動 prefix */
  basePath: string;
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部狀態" },
  { value: "linked", label: "已綁定 LINE" },
  { value: "unlinked", label: "未綁定 LINE" },
  { value: "lead", label: "名單" },
  { value: "customer", label: "顧客" },
];

const VISIT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部來店" },
  { value: "month", label: "本月來店" },
  { value: "stale30", label: "30 天未來店" },
  { value: "never", label: "從未來店" },
];

const REFERRAL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部推薦" },
  { value: "has", label: "有推薦紀錄" },
  { value: "none", label: "無推薦紀錄" },
];

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "recent", label: "最近來店" },
  { value: "created", label: "建立時間" },
  { value: "points", label: "點數多寡" },
];

const FILTER_KEYS = ["search", "status", "visit", "referral", "staff"] as const;

export function CustomersToolbar({ staffOptions, basePath }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname(); // 真實 pathname，含 /hq 或 /s/{slug}/admin 前綴
  const [isPending, startTransition] = useTransition();

  const current = useMemo(
    () => ({
      search: searchParams.get("search") ?? "",
      status: searchParams.get("status") ?? "",
      visit: searchParams.get("visit") ?? "",
      referral: searchParams.get("referral") ?? "",
      staff: searchParams.get("staff") ?? "",
      sort: searchParams.get("sort") ?? "recent",
    }),
    [searchParams]
  );

  const [searchDraft, setSearchDraft] = useState(current.search);

  const hasActiveFilters = FILTER_KEYS.some((k) => {
    const v = searchParams.get(k);
    return !!v && v !== "";
  });

  const pushParams = (mutate: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    // 任何篩選/排序變更都重置分頁
    params.delete("page");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  const setParam = (key: string, value: string) =>
    pushParams((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
    });

  const onSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setParam("search", searchDraft.trim());
  };

  const selectClass =
    "rounded-md border border-earth-300 bg-white px-2 py-1.5 text-xs text-earth-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300 disabled:opacity-60";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-earth-200 pb-3">
      <form onSubmit={onSearchSubmit} className="flex min-w-[220px] flex-1 items-center gap-1.5">
        <input
          name="search"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="搜尋姓名 / 電話 / LINE 名稱"
          className="min-w-0 flex-1 rounded-md border border-earth-300 bg-white px-3 py-1.5 text-xs text-earth-800 placeholder:text-earth-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300"
        />
        {searchDraft !== current.search ? (
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-primary-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            搜尋
          </button>
        ) : null}
      </form>

      <select
        value={current.status}
        onChange={(e) => setParam("status", e.target.value)}
        disabled={isPending}
        className={selectClass}
        aria-label="狀態"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        value={current.visit}
        onChange={(e) => setParam("visit", e.target.value)}
        disabled={isPending}
        className={selectClass}
        aria-label="來店"
      >
        {VISIT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        value={current.referral}
        onChange={(e) => setParam("referral", e.target.value)}
        disabled={isPending}
        className={selectClass}
        aria-label="推薦"
      >
        {REFERRAL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {staffOptions.length > 0 ? (
        <select
          value={current.staff}
          onChange={(e) => setParam("staff", e.target.value)}
          disabled={isPending}
          className={selectClass}
          aria-label="直屬店長"
        >
          <option value="">全部店長</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
      ) : null}

      <div className="flex items-center gap-1">
        <span className="text-[11px] text-earth-500">排序</span>
        <select
          value={current.sort}
          onChange={(e) => setParam("sort", e.target.value === "recent" ? "" : e.target.value)}
          disabled={isPending}
          className={selectClass}
          aria-label="排序"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {hasActiveFilters ? (
        <Link
          href={basePath}
          className="text-[11px] text-earth-500 hover:text-earth-700 underline-offset-2 hover:underline"
        >
          清除篩選
        </Link>
      ) : null}
    </div>
  );
}
