"use client";

import { useState, type ReactNode } from "react";
import type { UserRole } from "@prisma/client";
import type { PermissionCode } from "@/lib/permissions";

export function RoleEditForm({ action, initialRole, permissions, canAssignRoles, presets, labels, roleLabels, allPermissions, children }: {
  action: (data: FormData) => Promise<void>; initialRole: UserRole;
  permissions: PermissionCode[]; canAssignRoles: boolean; children: ReactNode;
  presets: Record<string, PermissionCode[]>; labels: Record<PermissionCode, string>; roleLabels: Record<UserRole, string>; allPermissions: PermissionCode[];
}) {
  const [role, setRole] = useState(initialRole);
  const [preset, setPreset] = useState(false);
  const before = initialRole === "OWNER" ? allPermissions : permissions;
  const after = role === "OWNER" || preset ? presets[role] ?? [] : permissions;
  const added = after.filter(code => !before.includes(code));
  const removed = before.filter(code => !after.includes(code));
  const changed = role !== initialRole || preset;
  const changes = [added.length ? `增加：${added.map(code => labels[code]).join("、")}` : "",
    removed.length ? `移除：${removed.map(code => labels[code]).join("、")}` : ""].filter(Boolean);
  return <form action={action} className="space-y-4" onSubmit={event => {
    if (changed && !window.confirm(`角色：${roleLabels[initialRole]} → ${roleLabels[role]}\n${changes.join("\n") || "保留現有個別授權"}\n角色變更後需重新登入。確認儲存？`)) event.preventDefault();
  }}>
    <div>
      <label htmlFor="staff-role" className="block text-sm font-medium text-earth-700">後台角色</label>
      <select id="staff-role" name="role" value={role} onChange={e => setRole(e.target.value as UserRole)}
        className="mt-1 min-h-11 w-full rounded-lg border border-earth-300 px-3 text-sm" disabled={!canAssignRoles}>
        {canAssignRoles ? <><option value="OWNER">Owner／老闆</option><option value="MANAGER">Manager／店長</option><option value="STAFF">Staff／門市人員</option>{initialRole === "PARTNER" && <option value="PARTNER">門市人員（舊帳號）</option>}</> : <option value={initialRole}>{roleLabels[initialRole]}</option>}
      </select>
      {canAssignRoles && <label className="flex min-h-11 items-center gap-2 text-sm">
        <input name="applyRolePreset" type="checkbox" value="true" checked={preset} onChange={e => setPreset(e.target.checked)} />套用角色預設權限
      </label>}
      {changed && <div className="space-y-1 text-sm text-earth-600"><p>{preset ? "將取代個別授權" : role === "OWNER" ? "老闆權限全開放" : "保留現有個別授權"}</p>{changes.map(change => <p key={change}>{change}</p>)}</div>}
    </div>
    {children}
  </form>;
}
