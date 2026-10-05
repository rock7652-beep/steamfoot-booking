"use client";

/** Shared account role control; teaching identities are managed separately. */
export function StaffRoleControl({ role, canAssignRoles, presets, onRole, onPreset, disabled = false, compact = false }: {
  role: string; canAssignRoles: boolean; presets: Record<string, string[]>;
  onRole: (role: string) => void; onPreset: (permissions: string[]) => void; disabled?: boolean; compact?: boolean;
}) {
  return <section className="space-y-2">
    <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
      <label className="block text-sm">後台角色
        <select aria-label="後台角色" name="backendRole" value={role} disabled={disabled || !canAssignRoles}
          onChange={e => onRole(e.target.value)} className="min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3 py-2 text-base">
          <option value="STAFF">Staff／門市人員</option>
          {(canAssignRoles || role === "MANAGER") && <option value="MANAGER">Manager／店長</option>}
          {(canAssignRoles || role === "OWNER") && <option value="OWNER">Owner／老闆</option>}
          {role === "PARTNER" && <option value="PARTNER">既有合作人員</option>}
          {role === "ADMIN" && <option value="ADMIN">系統管理者</option>}
        </select>
      </label>
      {canAssignRoles && role !== "OWNER" && role !== "ADMIN" && <button type="button" disabled={disabled}
        className="min-h-11 self-end rounded-xl border border-earth-200 px-3 text-sm text-primary-800 disabled:opacity-50"
        onClick={() => onPreset(presets[role] ?? [])}>套用角色預設權限</button>}
    </div>
    {!compact && <p className="text-sm text-earth-600">{role === "OWNER" || role === "ADMIN" ? "此角色權限全開放。" : "切換角色保留目前權限；需要時可套用新角色預設，再逐項調整。"}</p>}
  </section>;
}
