import type { ReactNode } from "react";

interface AdminShellProps {
  children: ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-6 md:px-8 lg:space-y-6">
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}

interface AdminGridProps {
  children: ReactNode;
  className?: string;
}

export function AdminGrid({ children, className = "" }: AdminGridProps) {
  return <div className={`grid grid-cols-12 gap-4 ${className}`}>{children}</div>;
}

interface AdminCardProps {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md";
}

export function AdminCard({ children, className = "", padding = "md" }: AdminCardProps) {
  const pad = padding === "none" ? "" : padding === "sm" ? "p-3" : "p-4";
  return (
    <div
      className={`rounded-lg border border-earth-200 bg-white ${pad} ${className}`}
    >
      {children}
    </div>
  );
}
