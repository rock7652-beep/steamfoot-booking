"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

interface CustomerResult {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  stage: string;
  staffName: string | null;
  staffColor: string | null;
  remainingSessions: number;
}

interface CustomerSearchProps {
  defaultCustomerId?: string;
  defaultCustomerLabel?: string;
}

/** Client search cache：keyword → results。
 *  - 同 session 內同關鍵字第二次秒回，不打 server
 *  - 不需要 storeId 當 key — server 端 searchCustomers 已用 getStoreFilter
 *    隔離（顧客不會跨店外洩），且本元件每次 mount 都是新的 Map（換店重新建）
 *  - cache 鍵用「正規化過的 query」(trim + lower)，避免大小寫和空白浪費 entry
 */
const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 250;

export default function CustomerSearch({
  defaultCustomerId,
  defaultCustomerLabel,
}: CustomerSearchProps) {
  const [query, setQuery] = useState(defaultCustomerLabel ?? "");
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [selectedId, setSelectedId] = useState(defaultCustomerId ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);
  // Cache 與 race guard
  const searchCacheRef = useRef<Map<string, CustomerResult[]>>(new Map());
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const normalized = query.trim().toLowerCase();
    if (normalized.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      return;
    }

    // Cache hit → 同步顯示、不打 server
    const cached = searchCacheRef.current.get(normalized);
    if (cached) {
      setResults(cached);
      setIsOpen(true);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/customers/search?q=${encodeURIComponent(query)}&limit=10`
        );
        // 慢回來的舊 request — 使用者已經改字了，丟掉結果
        if (requestId !== requestIdRef.current) return;
        if (res.ok) {
          const data = (await res.json()) as CustomerResult[];
          searchCacheRef.current.set(normalized, data);
          setResults(data);
          setIsOpen(true);
        }
      } catch {
        if (requestId === requestIdRef.current) {
          toast.error("搜尋顧客失敗，請重試");
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectCustomer(c: CustomerResult) {
    setSelectedId(c.id);
    setQuery(`${c.name}（${c.phone || c.email || ""}）`);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name="customerId" value={selectedId} />
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (selectedId) setSelectedId("");
        }}
        onFocus={() => results.length > 0 && setIsOpen(true)}
        placeholder="搜尋姓名、電話或 Email..."
        className="block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-3 top-2.5 text-xs text-earth-400">
          搜尋中...
        </div>
      )}

      {/* Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-earth-200 bg-white shadow-lg max-h-60 overflow-y-auto">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => selectCustomer(c)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-primary-50 active:bg-primary-100 transition-colors"
            >
              <div>
                <span className="font-medium text-earth-900">{c.name}</span>
                {c.phone && (
                  <span className="ml-2 text-earth-500">{c.phone}</span>
                )}
                {c.email && (
                  <span className="ml-2 text-xs text-earth-400">{c.email}</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs">
                {c.staffName && (
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: c.staffColor || "#999" }}
                    />
                    {c.staffName}
                  </span>
                )}
                {c.remainingSessions > 0 && (
                  <span className="text-primary-600">
                    剩{c.remainingSessions}堂
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && results.length === 0 && query.trim().length >= MIN_QUERY_LENGTH && !loading && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-earth-200 bg-white p-3 shadow-lg text-center text-sm text-earth-400">
          找不到匹配的顧客
        </div>
      )}

      {!selectedId && (
        <input
          type="text"
          required
          tabIndex={-1}
          className="absolute opacity-0 h-0 w-0"
          value={selectedId}
          onChange={() => {}}
        />
      )}
    </div>
  );
}
