"use client";

import { CustomerInstantSearch } from "@/components/customer-instant-search";
import { normalizeCustomerSearch } from "@/lib/customer-search-index";
import { NavigationNotice } from "@/components/navigation-notice";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  courseMode?: boolean;
  instantStoreId?: string;
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

export function CustomersToolbar({ staffOptions, basePath, courseMode = false, instantStoreId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname(); // 真實 pathname，含 /hq 或 /s/{slug}/admin 前綴
  const [isPending, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const [draft, setDraft] = useState({source:current.search,value:current.search});
  const searchDraft = instantStoreId || draft.source === current.search ? draft.value : current.search;
  const instantQuery = normalizeCustomerSearch(searchDraft);
  const lastListRequest = useRef<string | null>(null);

  // Local suggestions are immediate; serialize list navigations and retain the
  // latest input while the previous server-rendered list is still pending.
  useEffect(() => {
    if (!instantStoreId || isPending || instantQuery === current.search) return;
    const params = new URLSearchParams(searchParams.toString());
    if (instantQuery) params.set("search", instantQuery);
    else params.delete("search");
    params.delete("page");
    const url = `${pathname}?${params}`;
    if (lastListRequest.current === url) return;
    lastListRequest.current = url;
    startTransition(() => router.replace(url, { scroll: false }));
  }, [instantStoreId, isPending, instantQuery, current.search, searchParams, pathname, router]);

  useEffect(() => {
    if (!instantStoreId) return;
    const restore = () => {
      lastListRequest.current = null;
      const search = new URLSearchParams(window.location.search).get("search") ?? "";
      setDraft({ source: search, value: search });
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [instantStoreId]);

  const hasActiveFilters = FILTER_KEYS.some((k) => {
    const v = searchParams.get(k);
    return !!v && v !== "";
  });
  const advancedActiveCount = [current.status, current.visit, current.referral, current.staff, current.sort === "recent" ? "" : current.sort].filter(Boolean).length;
  const courseLabel = (label: string) => label.replaceAll("來店", "上課").replace("點數多寡", "可用點數");
  const activeFilterLabels = [
    STATUS_OPTIONS.find((option) => option.value === current.status)?.label,
    VISIT_OPTIONS.find((option) => option.value === current.visit)?.label,
    REFERRAL_OPTIONS.find((option) => option.value === current.referral)?.label,
    staffOptions.find((option) => option.id === current.staff)?.displayName,
    current.sort !== "recent" ? SORT_OPTIONS.find((option) => option.value === current.sort)?.label : undefined,
  ].filter((label): label is string => !!label && !label.startsWith("全部")).map(courseLabel);

  const pushParams = (mutate: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    if (instantStoreId) {
      if (instantQuery) params.set("search", instantQuery);
      else params.delete("search");
    }
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
    setParam("search", instantStoreId ? instantQuery : searchDraft.trim());
  };

  const selectClass =
    `${courseMode ? "min-h-11 min-w-0 flex-1 sm:flex-none " : ""}rounded-md border border-earth-300 bg-white px-2 py-1.5 text-xs text-earth-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300 disabled:opacity-60`;

  if (courseMode) {
    return (
      <div className="space-y-2 border-b border-earth-200 pb-3">
        {isPending && <NavigationNotice />}
        <div className="flex items-center gap-2">
          <form onSubmit={onSearchSubmit} className="flex min-w-0 flex-1 items-center gap-2">
            <input
              name="search"
              value={searchDraft}
              onChange={(e) => setDraft({source:current.search,value:e.target.value})}
              placeholder="搜尋姓名／電話"
              className="min-h-11 min-w-0 flex-1 rounded-md border border-earth-300 bg-white px-3 text-sm text-earth-800 placeholder:text-earth-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300"
            />
            {searchDraft !== current.search ? (
              <button
                type="submit"
                disabled={isPending}
                className="min-h-11 shrink-0 rounded-md bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              >
                搜尋
              </button>
            ) : null}
          </form>
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="course-customer-filters"
            onClick={() => setFiltersOpen((open) => !open)}
            className="min-h-11 shrink-0 rounded-md border border-earth-300 bg-white px-4 text-sm font-medium text-earth-700 hover:border-primary-400 hover:text-primary-700"
          >
            篩選{advancedActiveCount > 0 ? `（${advancedActiveCount}）` : ""}
          </button>
        </div>

        {!filtersOpen && activeFilterLabels.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="目前篩選條件">
            {activeFilterLabels.map((label) => (
              <span key={label} className="rounded-full bg-primary-50 px-2.5 py-1 text-xs text-primary-700">{label}</span>
            ))}
            <Link href={basePath} className="ml-1 text-xs text-earth-500 underline-offset-2 hover:text-earth-700 hover:underline">
              清除
            </Link>
          </div>
        ) : null}

        {filtersOpen ? (
          <div id="course-customer-filters" className="rounded-lg border border-earth-200 bg-earth-50/50 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-earth-600">
                <span>顧客狀態</span>
                <select value={current.status} onChange={(e) => setParam("status", e.target.value)} disabled={isPending} className="min-h-11 w-full rounded-md border border-earth-300 bg-white px-3 text-sm text-earth-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300">
                  {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{courseLabel(option.label)}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm text-earth-600">
                <span>上課狀態</span>
                <select value={current.visit} onChange={(e) => setParam("visit", e.target.value)} disabled={isPending} className="min-h-11 w-full rounded-md border border-earth-300 bg-white px-3 text-sm text-earth-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300">
                  {VISIT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{courseLabel(option.label)}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm text-earth-600">
                <span>推薦紀錄</span>
                <select value={current.referral} onChange={(e) => setParam("referral", e.target.value)} disabled={isPending} className="min-h-11 w-full rounded-md border border-earth-300 bg-white px-3 text-sm text-earth-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300">
                  {REFERRAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              {staffOptions.length > 0 ? (
                <label className="space-y-1 text-sm text-earth-600">
                  <span>直屬店長</span>
                  <select value={current.staff} onChange={(e) => setParam("staff", e.target.value)} disabled={isPending} className="min-h-11 w-full rounded-md border border-earth-300 bg-white px-3 text-sm text-earth-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300">
                    <option value="">全部店長</option>
                    {staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.displayName}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="space-y-1 text-sm text-earth-600">
                <span>排序方式</span>
                <select value={current.sort} onChange={(e) => setParam("sort", e.target.value === "recent" ? "" : e.target.value)} disabled={isPending} className="min-h-11 w-full rounded-md border border-earth-300 bg-white px-3 text-sm text-earth-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300">
                  {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{courseLabel(option.label)}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-3 flex items-center justify-end gap-3">
              {hasActiveFilters || advancedActiveCount > 0 ? (
                <Link href={basePath} className="inline-flex min-h-11 items-center px-2 text-sm text-earth-500 underline-offset-2 hover:text-earth-700 hover:underline">
                  清除全部
                </Link>
              ) : null}
              <button type="button" onClick={() => setFiltersOpen(false)} className="min-h-11 rounded-md border border-earth-300 bg-white px-4 text-sm text-earth-700 hover:border-primary-400">
                完成
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-earth-200 pb-3">
      {isPending && <NavigationNotice />}
      <form onSubmit={onSearchSubmit} className={courseMode ? "flex min-w-0 basis-full items-center gap-2 lg:basis-64 lg:flex-1" : "flex min-w-[220px] flex-1 items-center gap-1.5"}>
        {instantStoreId ? <CustomerInstantSearch key={instantStoreId} storeId={instantStoreId} value={searchDraft}
          className="w-full min-w-0 rounded-md border border-earth-300 bg-white px-3 py-1.5 text-xs text-earth-800 focus:border-primary-400 focus:outline-none"
          onChange={(value) => {
            setDraft({ source: current.search, value });
          }}
          onSelect={(customer) => {
            pushParams((p) => { p.set("customerId", customer.id); });
          }} /> : <>
        <input
          name="search"
          value={searchDraft}
          onChange={(e) => setDraft({source:current.search,value:e.target.value})}
          placeholder="搜尋姓名 / 電話 / LINE 名稱"
          className={`${courseMode ? "min-h-11 " : ""}min-w-0 flex-1 rounded-md border border-earth-300 bg-white px-3 py-1.5 text-xs text-earth-800 placeholder:text-earth-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300`}
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
        </>}
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
            {courseMode ? o.label.replaceAll("來店", "上課").replace("點數多寡", "可用點數") : o.label}
          </option>
        ))}
      </select>

      <select
        value={current.visit}
        onChange={(e) => setParam("visit", e.target.value)}
        disabled={isPending}
        className={selectClass}
        aria-label={courseMode ? "上課" : "來店"}
      >
        {VISIT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {courseMode ? o.label.replaceAll("來店", "上課").replace("點數多寡", "可用點數") : o.label}
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
            {courseMode ? o.label.replaceAll("來店", "上課").replace("點數多寡", "可用點數") : o.label}
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
              {courseMode ? o.label.replaceAll("來店", "上課").replace("點數多寡", "可用點數") : o.label}
            </option>
          ))}
        </select>
      </div>

      {hasActiveFilters ? (
        <Link
          href={basePath}
          onClick={() => setDraft({ source: "", value: "" })}
          className="text-[11px] text-earth-500 hover:text-earth-700 underline-offset-2 hover:underline"
        >
          清除篩選
        </Link>
      ) : null}
    </div>
  );
}
