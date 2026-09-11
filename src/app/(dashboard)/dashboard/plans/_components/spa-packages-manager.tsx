"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { saveSpaPackage } from "@/server/actions/spa-commerce";
type Package = {
  id: string;
  name: string;
  treatmentId: string;
  price: number;
  uses: number;
  validityDays: number;
  isActive: boolean;
};
export function SpaPackagesManager({
  packages,
  services,
  canManage,
}: {
  packages: Package[];
  services: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter(),
    [filter, setFilter] = useState("ACTIVE"),
    [search, setSearch] = useState(""),
    [service, setService] = useState(""),
    [editing, setEditing] = useState<Partial<Package> | null>(null),
    [error, setError] = useState(""),
    [pending, start] = useTransition();
  const visible = packages.filter(
    (p) =>
      (filter === "ALL" || (filter === "ACTIVE" ? p.isActive : !p.isActive)) &&
      (!service || p.treatmentId === service) &&
      p.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <section className="space-y-4 rounded-xl border border-earth-200 bg-white p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">次數方案</h2>
          <p className="text-sm text-earth-500">
            設定售價、堂數與期限；到顧客管理替顧客購買。
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => {
              setError("");
              setEditing({
                name: "",
                treatmentId: services[0]?.id ?? "",
                price: 0,
                uses: 10,
                validityDays: 180,
                isActive: true,
              });
            }}
            className="rounded-lg bg-[#596D45] hover:bg-[#4B5E3B] p-3 text-white"
          >
            新增方案
          </button>
        )}
      </header>
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="方案篩選"
      >
        <input
          aria-label="搜尋方案"
          placeholder="搜尋方案名稱"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 rounded-lg border border-earth-200 px-3 py-2"
        />
        <select
          aria-label="適用服務"
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="max-w-full rounded-lg border border-earth-200 px-3 py-2"
        >
          <option value="">全部服務</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {[
          ["ACTIVE", "上架"],
          ["INACTIVE", "下架"],
          ["ALL", "全部"],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`rounded-lg border border-earth-200 px-4 py-2 ${filter === value ? "bg-[#596D45] hover:bg-[#4B5E3B] text-white" : "bg-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-earth-100 bg-earth-50">
              {[
                "方案／適用服務",
                "次數",
                "總價／每次",
                "期限",
                "狀態",
                "操作",
              ].map((t) => (
                <th key={t} className="p-3">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr
                key={p.id}
                className="border-b border-earth-100 hover:bg-earth-50/50"
              >
                <td className="p-3">
                  <strong>{p.name}</strong>
                  <p className="text-earth-500">
                    {services.find((s) => s.id === p.treatmentId)?.name ??
                      "服務已停用"}
                  </p>
                </td>
                <td className="p-3 whitespace-nowrap">{p.uses} 次</td>
                <td className="p-3 whitespace-nowrap">
                  NT${p.price.toLocaleString()}
                  <p className="text-earth-500">
                    每次約 NT${Math.round(p.price / p.uses).toLocaleString()}
                  </p>
                </td>
                <td className="p-3 whitespace-nowrap">{p.validityDays} 天</td>
                <td className="p-3 whitespace-nowrap">
                  {p.isActive ? "上架" : "下架"}
                </td>
                <td className="p-3">
                  {canManage && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setError("");
                          setEditing(p);
                        }}
                        className="rounded-lg border border-earth-200 p-2"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => {
                          setError("");
                          setEditing({
                            ...p,
                            id: undefined,
                            name: `${p.name.slice(0, 76)}（複本）`,
                            isActive: false,
                          });
                        }}
                        className="rounded-lg border border-earth-200 p-2"
                      >
                        複製
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-earth-500">
                  沒有符合篩選的方案
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <RightSheet
          open
          onClose={() => {
            if (!pending) setEditing(null);
          }}
          width={520}
          labelledById="package-title"
        >
          <form
            className="min-h-0 flex-1 overflow-y-auto space-y-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              start(async () => {
                try {
                  const r = await saveSpaPackage(editing as Package);
                  if (!r.success) {
                    setError(r.error);
                    return;
                  }
                  setFilter(editing.isActive ? "ACTIVE" : "INACTIVE");
                  setEditing(null);
                  router.refresh();
                } catch {
                  setError("儲存失敗，請重試。");
                }
              });
            }}
          >
            <h2 id="package-title" className="text-xl font-bold">
              {editing.id ? "編輯方案" : "新增方案"}
            </h2>
            <fieldset disabled={pending} className="space-y-4">
              <label className="block">
                方案名稱
                <input
                  required
                  maxLength={80}
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-earth-200 p-3"
                />
              </label>
              <label className="block">
                適用服務
                <select
                  required
                  value={editing.treatmentId}
                  onChange={(e) =>
                    setEditing({ ...editing, treatmentId: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-earth-200 p-3"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  ["price", "售價", 0, 9999999],
                  ["uses", "堂數", 1, 999],
                  ["validityDays", "有效天數（含購買日）", 1, 3650],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key} className="block">
                  {label}
                  <input
                    required
                    type="number"
                    step={1}
                    min={min}
                    max={max}
                    value={editing[key]}
                    onChange={(e) =>
                      setEditing({ ...editing, [key]: Number(e.target.value) })
                    }
                    className="mt-1 w-full rounded border border-earth-200 p-3"
                  />
                </label>
              ))}
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={editing.isActive}
                  onChange={(e) =>
                    setEditing({ ...editing, isActive: e.target.checked })
                  }
                />
                上架
              </label>
              <p className="text-sm">
                修改只影響之後的購買，既有顧客的堂數、金額及期限保持原紀錄。
              </p>
              {error && (
                <p role="alert" className="text-red-700">
                  {error}
                </p>
              )}
              <button className="rounded-lg bg-[#596D45] hover:bg-[#4B5E3B] p-3 text-white">
                {pending ? "儲存中…" : "儲存方案"}
              </button>
              <button
                type="button"
                className="ml-3"
                onClick={() => setEditing(null)}
              >
                返回
              </button>
            </fieldset>
          </form>
        </RightSheet>
      )}
    </section>
  );
}
