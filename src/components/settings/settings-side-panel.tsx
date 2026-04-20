import { DashboardLink as Link } from "@/components/dashboard-link";
import { SideCard, InfoList, type InfoListItem } from "@/components/desktop";

/**
 * Settings Primitive — SettingsSidePanel
 *
 * 設定首頁右欄浮動資訊區。三塊：
 *   1. 快速操作（連結群）
 *   2. 系統資訊（店別 / 方案 / 版本 — 透過 InfoList 呈現）
 *   3. 使用提示（選填 children — 例如「尚未設定完整營業時間」警示）
 *
 * 右欄定位：輕量、不動作密集，讓桌機頁面不要中間空空。
 */

export interface SidePanelQuickAction {
  label: string;
  href: string;
}

interface SettingsSidePanelProps {
  quickActions: SidePanelQuickAction[];
  systemInfo: InfoListItem[];
  /** 放在最下方的提示區塊（選填，例如警示 banner、提醒） */
  children?: React.ReactNode;
}

export function SettingsSidePanel({
  quickActions,
  systemInfo,
  children,
}: SettingsSidePanelProps) {
  return (
    <>
      <SideCard title="快速操作" subtitle="常用入口直接進入">
        <ul className="flex flex-col gap-1">
          {quickActions.map((a) => (
            <li key={a.href}>
              <Link
                href={a.href}
                className="flex items-center justify-between rounded-md border border-earth-200 px-2.5 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
              >
                <span>{a.label}</span>
                <span className="text-earth-300">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </SideCard>

      <SideCard title="系統資訊" subtitle="目前店別／方案">
        <InfoList items={systemInfo} />
      </SideCard>

      {children ?? null}
    </>
  );
}
