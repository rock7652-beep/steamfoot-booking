/**
 * Settings Primitive — SettingsShell
 *
 * 設定首頁三欄版型外層。響應式：
 *   desktop (xl+) : [nav col-2] [main col-8 / 2-column cards] [side col-2]
 *   desktop (lg)  : [nav col-2] [main col-7 / single column] [side col-3]
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
    <div className="grid grid-cols-12 gap-3 xl:gap-4">
      <aside className="col-span-12 md:col-span-3 lg:col-span-2">
        <div className="sticky top-4 space-y-3">{nav}</div>
      </aside>

      <main className="col-span-12 md:col-span-9 lg:col-span-7 xl:col-span-8">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{children}</div>
      </main>

      {side ? (
        <aside className="col-span-12 space-y-3 lg:col-span-3 xl:col-span-2">{side}</aside>
      ) : null}
    </div>
  );
}
