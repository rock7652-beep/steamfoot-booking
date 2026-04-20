import type { ReactNode } from "react";

export type StatusVariant = "success" | "warning" | "danger" | "info" | "neutral";

const VARIANT = {
  success: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  warning: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  danger: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  info: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  neutral: { bg: "bg-earth-100", text: "text-earth-700", dot: "bg-earth-400" },
} as const;

interface StatusBadgeProps {
  variant: StatusVariant;
  children: ReactNode;
  dot?: boolean;
}

export function StatusBadge({ variant, children, dot = true }: StatusBadgeProps) {
  const v = VARIANT[variant];
  return (
    <span
      className={`inline-flex h-[22px] items-center gap-1 rounded px-2 text-xs font-semibold ${v.bg} ${v.text}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} aria-hidden />}
      {children}
    </span>
  );
}

export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export function bookingStatusMeta(
  status: BookingStatus | string,
  // isCheckedIn 是 legacy boolean，僅對舊資料生效；新資料以 CHECKED_IN status 為準
  isCheckedIn?: boolean,
): { label: string; variant: StatusVariant } {
  switch (status) {
    case "COMPLETED":
      return { label: "已完成", variant: "success" };
    case "CHECKED_IN":
      return { label: "已到店", variant: "warning" };
    case "CONFIRMED":
      return { label: "已確認", variant: "info" };
    case "PENDING":
      return { label: "預約中", variant: "neutral" };
    case "CANCELLED":
      return { label: "已取消", variant: "neutral" };
    case "NO_SHOW":
      return { label: "未到", variant: "danger" };
    default:
      // legacy 資料：status 不在預期集合，但 isCheckedIn=true 表示到店
      if (isCheckedIn) return { label: "已到店", variant: "warning" };
      return { label: String(status), variant: "neutral" };
  }
}
