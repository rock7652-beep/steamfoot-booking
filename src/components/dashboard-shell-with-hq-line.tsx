"use client";

import DashboardShell, { NAV_GROUPS } from "@/components/sidebar";

const settingsGroup = NAV_GROUPS.find((group) => group.id === "settings");
const hasLineOfficialAccountsEntry = settingsGroup?.items.some(
  (item) => item.href === "/dashboard/settings/line-official-accounts",
);

if (settingsGroup && !hasLineOfficialAccountsEntry) {
  settingsGroup.items.push({
    href: "/dashboard/settings/line-official-accounts",
    label: "LINE 官方帳號管理",
    ownerOnly: true,
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.142-4.03 7.5-9 7.5a10.45 10.45 0 01-4.06-.797L3 20.25l1.465-3.665C3.545 15.323 3 13.75 3 12c0-4.142 4.03-7.5 9-7.5s9 3.358 9 7.5z"
        />
      </svg>
    ),
  });
}

export default DashboardShell;
