"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";

import { saveCourseStaff } from "@/server/actions/course-staff";
type Person = {
  id: string;
  name: string;
  kind: "manager" | "coach";
  email: string;
  active: boolean;
  permissions: string[];
  customerId: string;
};
const field = "min-h-11 w-full rounded-lg border border-earth-200 p-2";
const button =
  "min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
export function CourseStaffWorkspace({
  staff,
  customers,
  canManage,
  permissionGroups,
}: {
  staff: Person[];
  customers: { id: string; name: string }[];
  canManage: boolean;
  permissionGroups: { label: string; codes: { code: string; label: string }[] }[];
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [role, setRole] = useState("all"),
    [open, setOpen] = useState(false),
    [person, setPerson] = useState<Person | null>(null),
    [kind, setKind] = useState<"coach" | "manager">("coach"),
    [error, setError] = useState(""),
    [key, setKey] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const rows = staff
    .filter(
      (s) =>
        `${s.name} ${s.email}`.includes(search) &&
        (filter === "all" || s.active === (filter === "active")) &&
        (role === "all" || s.kind === role),
    )
    .sort((a, b) => Number(b.active) - Number(a.active));
  function edit(p: Person | null) {
    setPerson(p);
    setKind(p?.kind ?? "coach");
    setError("");
    setKey(crypto.randomUUID());
    setOpen(true);
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          className={`${field} max-w-xs`}
          aria-label="搜尋人員"
          placeholder="搜尋姓名／信箱"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={button}
          aria-label="人員角色"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="all">全部角色</option>
          <option value="manager">店長</option>
          <option value="coach">教練</option>
        </select>
        <select
          className={button}
          aria-label="人員狀態"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">全部狀態</option>
          <option value="active">啟用</option>
          <option value="inactive">停用</option>
        </select>
        {canManage && (
          <button className={button} onClick={() => edit(null)}>
            新增人員
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {["姓名", "身分", "登入／連結", "狀態", "操作"].map((t) => (
                <th key={t} className="p-3">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((p) => (
              <tr
                key={p.id}
                className={p.active ? "" : "text-earth-400 bg-earth-50"}
              >
                <td className="p-3">{p.name}</td>
                <td className="p-3">
                  {p.kind === "manager" ? "店長（後台）" : "教練（我的工作）"}
                </td>
                <td className="p-3">
                  {p.kind === "manager"
                    ? p.email
                    : (customers.find((c) => c.id === p.customerId)?.name ??
                      "尚未連結會員帳號")}
                </td>
                <td className="p-3">{p.active ? "啟用" : "停用"}</td>
                <td className="p-3">
                  {canManage && (
                    <button className={button} onClick={() => edit(p)}>
                      編輯
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <RightSheet
          open
          onClose={() => !pending && setOpen(false)}
          width={520}
          labelledById="course-staff-title"
        >
          <header className="flex shrink-0 items-center justify-between border-b p-4">
            <h2 id="course-staff-title" className="font-semibold">
              人員資料與權限
            </h2>
            <button
              className={button}
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              關閉
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {error && (
              <p role="alert" className="mb-3 text-red-700">
                {error}
              </p>
            )}
            <form
              id="course-staff-form"
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                start(async () => {
                  try {
                    const r = await saveCourseStaff({
                      id: person?.id,
                      name: d.get("name"),
                      kind,
                      email:
                        !person && kind === "manager"
                          ? d.get("email")
                          : undefined,
                      password:
                        !person && kind === "manager"
                          ? d.get("password")
                          : undefined,
                      customerId:
                        kind === "coach"
                          ? d.get("customerId") || undefined
                          : undefined,
                      active: d.get("active") === "yes",
                      permissions:
                        kind === "manager" ? d.getAll("permission") : undefined,
                      requestKey: key,
                    });
                    if (!r.success) setError(r.error);
                    else {
                      setOpen(false);
                      router.refresh();
                    }
                  } catch {
                    setError("儲存失敗，請重試");
                  }
                });
              }}
            >
              <label className="block">
                身分
                <select
                  className={field}
                  value={kind}
                  disabled={!!person}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                >
                  <option value="coach">教練：前台我的工作</option>
                  <option value="manager">店長：後台管理</option>
                </select>
              </label>
              <label className="block">
                姓名
                <input
                  className={field}
                  name="name"
                  defaultValue={person?.name}
                  required
                />
              </label>
              {kind === "coach" ? (
                <label className="block">
                  連結既有顧客
                  <select
                    className={field}
                    name="customerId"
                    defaultValue={person?.customerId}
                  >
                    <option value="">暫不連結</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-earth-500">
                    使用已綁定的會員帳號存取工作，不另設後台密碼。
                  </span>
                </label>
              ) : (
                !person && (
                  <>
                    <label className="block">
                      登入信箱
                      <input
                        className={field}
                        name="email"
                        type="email"
                        required
                      />
                    </label>
                    <label className="block">
                      登入密碼
                      <input
                        className={field}
                        name="password"
                        type="password"
                        minLength={8}
                        required
                        autoComplete="new-password"
                      />
                    </label>
                  </>
                )
              )}
              <label className="block">
                狀態
                <select
                  className={field}
                  name="active"
                  defaultValue={person?.active === false ? "no" : "yes"}
                >
                  <option value="yes">啟用</option>
                  <option value="no">停用</option>
                </select>
              </label>
              {kind === "manager" && (
                <details open>
                  <summary>店內管理權限</summary>
                  {permissionGroups.map((g) => (
                    <fieldset key={g.label} className="mt-3">
                      <legend className="font-medium">{g.label}</legend>
                      {g.codes.map(({code, label}) => (
                        <label
                          key={code}
                          className="flex min-h-11 items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            name="permission"
                            value={code}
                            defaultChecked={
                              person
                                ? person.permissions.includes(code)
                                : true
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </details>
              )}
            </form>
          </div>
          <footer className="shrink-0 border-t bg-white p-4">
            <button
              form="course-staff-form"
              type="submit"
              className={`${button} w-full bg-primary-700 text-white`}
              disabled={pending}
            >
              儲存人員
            </button>
          </footer>
        </RightSheet>
      )}
    </>
  );
}
