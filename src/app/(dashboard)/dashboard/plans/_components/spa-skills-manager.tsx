"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSpaServiceDetails } from "@/server/actions/spa-service-staff";
type Service = {
  id?: string;
  name: string;
  baseName: string;
  variantLabel: string;
  price: number;
  serviceMinutes: number;
  bufferMinutes: number;
  isActive: boolean;
  publicVisible: boolean;
  staffIds: string[];
  locationIds: string[];
};
export function SpaSkillsManager({
  services,
  people,
  locations,
  canManage,
}: {
  locations: { id: string; name: string; isActive: boolean }[];
  services: Service[];
  people: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Service | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [staff, setStaff] = useState("");
  const visible = services.filter(
    (s) =>
      s.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
      (status === "ALL" || (status === "ACTIVE" ? s.isActive : !s.isActive)) &&
      (!staff || s.staffIds.includes(staff)),
  );
  return (
    <section className="rounded-xl border border-earth-200 bg-white p-5">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">服務設定</h2>
        {canManage && (
          <button
            className="rounded-lg bg-[#596D45] hover:bg-[#4B5E3B] px-4 py-2 text-white"
            onClick={() => {
              setError("");
              setDraft({
                name: "",
                baseName: "",
                variantLabel: "",
                price: 0,
                serviceMinutes: 60,
                bufferMinutes: 0,
                isActive: true,
                publicVisible: false,
                staffIds: [],
                locationIds: [],
              });
            }}
          >
            新增服務
          </button>
        )}
      </header>
      <p className="mt-1 text-sm text-earth-500">
        設定誰能提供這項服務，預約時會再依排班與空檔篩選。
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          aria-label="搜尋服務"
          placeholder="搜尋服務名稱"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 rounded-lg border border-earth-200 px-3 py-2"
        />
        <select
          aria-label="服務狀態"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-earth-200 px-3 py-2"
        >
          <option value="ALL">全部狀態</option>
          <option value="ACTIVE">上架</option>
          <option value="INACTIVE">下架</option>
        </select>
        <select
          aria-label="可服務人員"
          value={staff}
          onChange={(e) => setStaff(e.target.value)}
          className="max-w-full rounded-lg border border-earth-200 px-3 py-2"
        >
          <option value="">全部人員</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="self-center text-sm text-earth-500">
          共 {visible.length} 筆
        </span>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead>
            <tr className="border-b border-earth-200">
              <th className="py-3">服務</th>
              <th className="px-3">時間／價格</th>
              <th className="px-3">可服務人員</th>
              <th className="px-3">位置／狀態</th>
              <th className="px-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.id} className="border-b border-earth-100">
                <td className="py-3">
                  {s.name}
                  {!s.isActive && (
                    <span className="ml-2 text-earth-400">已停用</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  服務 {s.serviceMinutes} 分鐘
                  {s.bufferMinutes > 0 && <> · 整理 {s.bufferMinutes} 分鐘</>}
                  <br />
                  NT${s.price.toLocaleString()}
                </td>
                <td className="px-3 py-3">
                  {people
                    .filter((p) => s.staffIds.includes(p.id))
                    .map((p) => p.name)
                    .join("、") || "⚠ 尚未設定人員"}
                </td>
                <td className="px-3 py-3">
                  {locations
                    .filter((l) => s.locationIds.includes(l.id))
                    .map((l) => l.name)
                    .join("、") || "⚠ 尚未設定位置"}
                  <br />
                  {s.isActive ? "上架" : "下架"} ·{" "}
                  {s.publicVisible ? "前台顯示" : "僅後台"}
                </td>
                <td className="px-3 py-3">
                  {canManage && (
                    <button
                      className="rounded border border-earth-200 px-3 py-2"
                      onClick={() => {
                        setError("");
                        setDraft({ ...s, staffIds: [...s.staffIds] });
                      }}
                    >
                      編輯服務
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-earth-500">
                  沒有符合篩選的服務
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {draft && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={draft.id ? "編輯服務" : "新增服務"}
            className="h-full w-full max-w-lg overflow-y-auto bg-white p-6"
          >
            <header className="mb-5 flex justify-between">
              <h3 className="text-xl font-semibold">
                {draft.id ? draft.name : "新增服務"}
              </h3>
              <button disabled={pending} onClick={() => setDraft(null)}>
                關閉
              </button>
            </header>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError("");
                start(async () => {
                  try {
                    const result = await saveSpaServiceDetails(draft);
                    if (!result.success) {
                      setError(result.error ?? "儲存失敗");
                      return;
                    }
                    setDraft(null);
                    router.refresh();
                  } catch {
                    setError("連線失敗，內容已保留");
                  }
                });
              }}
            >
              <fieldset disabled={pending} className="min-w-0">
                <div className="mb-5 grid grid-cols-2 gap-3">
                  {(
                    [
                      ["baseName", "服務名稱"],
                      ["variantLabel", "規格／副標"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="min-w-0">
                      {label}
                      <input
                        required={key === "baseName"}
                        maxLength={100}
                        className="mt-1 w-full min-w-0 rounded border border-earth-200 p-2"
                        value={draft[key]}
                        onChange={(e) =>
                          setDraft({ ...draft, [key]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                  {(
                    [
                      ["price", "價格"],
                      ["serviceMinutes", "服務分鐘"],
                      ["bufferMinutes", "整理分鐘"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="min-w-0">
                      {label}
                      <input
                        type="number"
                        required
                        min={key === "serviceMinutes" ? 1 : 0}
                        step="1"
                        className="mt-1 w-full min-w-0 rounded border border-earth-200 p-2"
                        value={draft[key]}
                        onChange={(e) =>
                          setDraft({ ...draft, [key]: Number(e.target.value) })
                        }
                      />
                    </label>
                  ))}
                  <div className="space-y-2">
                    <label className="block">
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        onChange={(e) =>
                          setDraft({ ...draft, isActive: e.target.checked })
                        }
                      />{" "}
                      上架服務
                    </label>
                    <label className="block">
                      <input
                        type="checkbox"
                        checked={draft.publicVisible}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            publicVisible: e.target.checked,
                          })
                        }
                      />{" "}
                      前台顯示
                    </label>
                  </div>
                </div>
                <fieldset className="mb-5">
                  <legend className="mb-2 font-semibold">適用位置</legend>
                  {locations.map((l) => (
                    <label key={l.id} className="mb-2 block">
                      <input
                        type="checkbox"
                        checked={draft.locationIds.includes(l.id)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            locationIds: e.target.checked
                              ? [...draft.locationIds, l.id]
                              : draft.locationIds.filter((id) => id !== l.id),
                          })
                        }
                      />{" "}
                      {l.name}
                      {!l.isActive && "（停用中）"}
                    </label>
                  ))}
                </fieldset>
                <p className="mb-4 text-sm text-earth-500">
                  勾選可提供這項服務的人員，會同步顯示在人員管理。
                </p>
                {people.map((p) => (
                  <label key={p.id} className="mb-3 flex gap-2">
                    <input
                      type="checkbox"
                      checked={draft.staffIds.includes(p.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          staffIds: e.target.checked
                            ? [...draft.staffIds, p.id]
                            : draft.staffIds.filter((id) => id !== p.id),
                        })
                      }
                    />
                    {p.name}
                  </label>
                ))}
                <p className="text-xs text-earth-500">
                  全部取消勾選後，此服務不會有可預約人員。既有預約仍保留。
                </p>
                {error && (
                  <p role="alert" className="mt-4 text-red-600">
                    {error}
                  </p>
                )}
                <button
                  disabled={pending}
                  className="mt-5 rounded bg-[#596D45] hover:bg-[#4B5E3B] px-4 py-2 text-white"
                >
                  {pending ? "儲存中…" : "儲存"}
                </button>
              </fieldset>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
