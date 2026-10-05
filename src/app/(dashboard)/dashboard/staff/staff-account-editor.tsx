"use client";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { RightSheet } from "@/components/admin/right-sheet";
import { StaffRoleControl } from "@/components/admin/staff-role-control";
import { fitnessEditorFooter, fitnessEditorSave } from "@/components/admin/course-editor-styles";
import styles from "@/components/admin/management-layout.module.css";
import { updateStaff } from "@/server/actions/staff";
import { ResetPasswordButton } from "./reset-password-button";
import type { StaffWorkspacePerson } from "./staff-workspace";

export type StaffAccountPolicy = {
  canAssignRoles: boolean;
  editablePermissions: string[];
  rolePresets: Record<string, string[]>;
  permissionGroups: { label: string; codes: { code: string; label: string }[] }[];
};
export const emptyStaffAccountPolicy: StaffAccountPolicy = { canAssignRoles: false, editablePermissions: [], rolePresets: {}, permissionGroups: [] };
const field = "min-h-11 min-w-0 w-full rounded-xl border border-earth-200 bg-white px-3 py-2 text-base text-earth-800 focus:border-primary-500 focus:ring-2 focus:ring-primary-100";
const button = "min-h-11 rounded-xl border border-earth-200 px-3 py-2 text-sm text-primary-800 disabled:opacity-50";

export function StaffAccountEditor({ person, policy, onClose }: {
  person: StaffWorkspacePerson; policy: StaffAccountPolicy; onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const [tab, setTab] = useState("basic");
  const [name, setName] = useState(person.displayName);
  const [email, setEmail] = useState(person.email === "尚未設定" ? "" : person.email);
  const [phone, setPhone] = useState(person.phone ?? "");
  const [color, setColor] = useState(person.colorCode);
  const [role, setRole] = useState(person.role ?? "STAFF");
  const [permissions, setPermissions] = useState<string[]>(person.permissions ?? []);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const allCodes = policy.permissionGroups.flatMap(g => g.codes.map(c => c.code));
  const fullAccess = role === "OWNER" || role === "ADMIN";
  const dirty = email !== (person.email === "尚未設定" ? "" : person.email) || name !== person.displayName || phone !== (person.phone ?? "") || color !== person.colorCode || role !== (person.role ?? "STAFF") || [...permissions].sort().join() !== [...(person.permissions ?? [])].sort().join();
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  function close() {
    if (saving || (dirty && !window.confirm("尚有未儲存的修改，確定關閉？"))) return;
    onClose();
  }
  function changePermission(code: string, granted: boolean) {
    setPermissions(current => granted ? [...new Set([...current, code])] : current.filter(c => c !== code));
  }
  async function save() {
    if (saving || !person.canEdit) return;
    if (role !== person.role && !window.confirm(`確認將 ${person.displayName} 的後台角色改為 ${role}？將依目前選定的權限儲存。`)) return;
    setSaving(true); setError("");
    try {
      const result = await updateStaff(person.id, {
        displayName: name.trim(), phone: phone.trim(), colorCode: color,
        ...(email !== (person.email === "尚未設定" ? "" : person.email) ? { email: email.trim() } : {}),
        ...(role !== person.role ? { role: role as Exclude<UserRole, "ADMIN" | "CUSTOMER"> } : {}),
        ...(!fullAccess ? { permissions: Object.fromEntries(allCodes.map(code => [code, permissions.includes(code)])) } : {}),
      });
      if (!result.success) { setError(result.error || "儲存失敗"); return; }
      router.refresh(); onClose();
    } catch { setError("儲存失敗，請重試；輸入內容已保留。"); }
    finally { setSaving(false); }
  }
  return createPortal(<RightSheet open presentation="centered" width={920} maxHeight={680}
    className={`${styles.panel} fitness-management-editor`} labelledById={titleId} onClose={close} closeOnEscape={!saving}>
    <header className="flex shrink-0 items-center justify-between border-b border-earth-200 bg-primary-50/60 px-4 py-2">
      <h2 id={titleId} className="font-semibold">{person.canEdit ? "編輯人員" : "查看人員"}</h2>
      <button type="button" className={button} disabled={saving} onClick={close}>關閉</button>
    </header>
    <nav className="flex flex-wrap gap-2 border-b border-earth-200 px-4 py-2" aria-label="人員編輯分頁">
      {[["basic", "基本資料"], ["permissions", "後台帳號／權限"]].map(([id, label]) => <button type="button" key={id} className={`${button} ${tab === id ? "!border-primary-300 !bg-primary-50 font-medium" : ""}`} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
    </nav>
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={e => { e.preventDefault(); void save(); }}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
        <fieldset disabled={saving || !person.canEdit} className="space-y-3">
          <div hidden={tab !== "basic"} className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
            <label className="block text-sm">姓名 *<input name="displayName" required maxLength={100} className={field} value={name} onChange={e => setName(e.target.value)}/></label>
            <label className="block text-sm">電話<input name="phone" maxLength={30} className={field} value={phone} onChange={e => setPhone(e.target.value)}/></label>
            <label className="block text-sm">識別色<input name="colorCode" type="color" className="block h-11 w-20 rounded-xl border border-earth-200" value={color} onChange={e => setColor(e.target.value)}/></label>
            <div className="text-sm">狀態<p className="py-3">{person.status === "ACTIVE" ? "啟用" : "停用"}</p></div>
          </div>
          <div hidden={tab !== "permissions"} className="space-y-3">
            <label className="block text-sm">後台登入信箱<input name="email" type="email" className={field} value={email} onChange={e => setEmail(e.target.value)}/></label>
            <StaffRoleControl role={role} canAssignRoles={policy.canAssignRoles} presets={policy.rolePresets} onRole={setRole} onPreset={setPermissions}/>
            {!fullAccess && <section className="space-y-2">
              <h3 className="font-semibold text-primary-800">店內管理權限 · {allCodes.filter(c => permissions.includes(c)).length}／{allCodes.length}</h3>
              <input aria-label="搜尋權限" placeholder="搜尋權限名稱" className={field} value={search} onChange={e => setSearch(e.target.value)}/>
              {policy.permissionGroups.map(group => ({ ...group, codes: group.codes.filter(c => `${c.label} ${c.code}`.toLowerCase().includes(search.trim().toLowerCase())) })).filter(g => g.codes.length).map(group => <details key={group.label} open={search ? true : undefined} className="rounded-xl border border-earth-200 px-3">
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-primary-800">{group.label} · {group.codes.filter(c => permissions.includes(c.code)).length}／{group.codes.length}</summary>
                <div className="grid grid-cols-1 gap-1 border-t border-earth-100 py-2 min-[520px]:grid-cols-2">
                  {group.codes.map(({ code, label }) => <label key={code} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={permissions.includes(code)} disabled={!policy.editablePermissions.includes(code)} onChange={e => changePermission(code, e.target.checked)}/>{label}</label>)}
                </div>
              </details>)}
            </section>}
          </div>
        </fieldset>
        {tab === "permissions" && person.canResetPassword && !dirty && !saving && <div className="mt-3"><ResetPasswordButton userId={person.userId} displayName={person.displayName}/></div>}
      </div>
      <footer className={`${fitnessEditorFooter} flex flex-wrap items-center justify-between gap-2`}>
        <span className={`text-sm ${dirty ? "text-amber-800" : "text-earth-500"}`}>{saving ? "儲存中…" : dirty ? "未儲存" : "尚未修改"}</span>
        <div className="flex gap-2"><button type="button" className={button} disabled={saving} onClick={close}>取消</button>{person.canEdit && <button type="submit" disabled={saving || !dirty} className={`${fitnessEditorSave} bg-primary-600 text-white disabled:opacity-50`}>{saving ? "儲存中…" : "儲存"}</button>}</div>
      </footer>
    </form>
  </RightSheet>, document.body);
}
