import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

export function PageHeader({ title, subtitle, right }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold leading-8 text-earth-900">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-earth-500">{subtitle}</p>
        )}
      </div>
      {right && <div className="flex items-center gap-3">{right}</div>}
    </div>
  );
}
