/**
 * Design System — Alert Card
 *
 * 統一的警示卡片，用於 Dashboard 警示區。
 * 三種級別：info（藍）、warning（琥珀）、error（紅）。
 */

import { DashboardLink as Link } from "@/components/dashboard-link";

const SEVERITY_MAP = {
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: "text-blue-500",
    title: "text-blue-800",
    desc: "text-blue-700",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: "text-amber-500",
    title: "text-amber-800",
    desc: "text-amber-700",
  },
  error: {
    bg: "bg-red-50",
    border: "border-red-200",
    icon: "text-red-500",
    title: "text-red-800",
    desc: "text-red-700",
  },
} as const;

interface AlertCardProps {
  severity: keyof typeof SEVERITY_MAP;
  title: string;
  description: string;
  action?: { label: string; href: string };
}

export function AlertCard({ severity, title, description, action }: AlertCardProps) {
  const s = SEVERITY_MAP[severity];

  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${s.bg} ${s.border}`}>
      <span className={`mt-0.5 shrink-0 ${s.icon}`}>
        {severity === "info" && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        {severity === "warning" && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        )}
        {severity === "error" && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold ${s.title}`}>{title}</p>
        <p className={`mt-0.5 text-[11px] ${s.desc}`}>{description}</p>
        {action && (
          <Link
            href={action.href}
            className={`mt-1.5 inline-block text-[11px] font-medium underline ${s.title}`}
          >
            {action.label} →
          </Link>
        )}
      </div>
    </div>
  );
}
