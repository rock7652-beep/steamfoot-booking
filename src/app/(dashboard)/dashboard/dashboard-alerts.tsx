"use client";

import { AlertCard } from "@/components/ui/alert-card";

interface DashboardAlertsProps {
  todayBookingCount: number;
  noShowCount: number;
}

export function DashboardAlerts({ todayBookingCount, noShowCount }: DashboardAlertsProps) {
  const alerts: { severity: "info" | "warning" | "error"; title: string; description: string; action?: { label: string; href: string } }[] = [];

  if (todayBookingCount === 0) {
    alerts.push({
      severity: "info",
      title: "今日無預約",
      description: "目前今天沒有任何預約，可以安排其他工作或主動聯繫顧客。",
      action: { label: "新增預約", href: "/dashboard/bookings/new" },
    });
  }

  if (noShowCount > 0) {
    alerts.push({
      severity: "warning",
      title: `${noShowCount} 筆未到`,
      description: "有預約顧客未到店，建議聯繫確認或標記狀態。",
      action: { label: "查看今日預約", href: "/dashboard/bookings" },
    });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => (
        <AlertCard key={i} {...alert} />
      ))}
    </div>
  );
}
