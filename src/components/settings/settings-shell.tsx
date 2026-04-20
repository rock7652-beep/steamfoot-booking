/**
 * Settings Primitive — SettingsShell
 *
 * 設定首頁三欄版型外層。響應式：
 *   desktop (lg+) : [nav col-2] [main col-7] [side col-3]
 *   tablet  (md)  : [nav col-3] [main col-9]（side 移到下方）
 *   mobile        : 單欄
 *
 * 用法：
 *   <SettingsShell
 *     nav={<SettingsNavSection .../>}
 *     side={<SettingsSidePanel .../>}
 *   >
 *     <SettingsActionCard ... />
 *     <SettingsActionCard ... />
 *   </SettingsShell>
 */

interface SettingsShellProps {
  nav: React.ReactNode;
  side?: React.ReactNode;
  children: React.ReactNode;
}

export function SettingsShell({ nav, side, children }: SettingsShellProps) {
  return (
    <div className="grid grid-cols-12 gap-4">
      <aside className="col-span-12 md:col-span-3 lg:col-span-2">
        <div className="sticky top-4 space-y-4">{nav}</div>
      </aside>

      <main className="col-span-12 md:col-span-9 lg:col-span-7">
        <div className="space-y-3">{children}</div>
      </main>

      {side ? (
        <aside className="col-span-12 space-y-3 lg:col-span-3">{side}</aside>
      ) : null}
    </div>
  );
}
