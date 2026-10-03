"use client";

import { useMemo, useState, type ReactNode } from "react";
import { DashboardLink } from "@/components/dashboard-link";

export type SettingsWorkspaceNavItem = {
  id: string;
  label: string;
  href?: string;
  status?: string;
};

export function SettingsWorkspaceNav({
  items,
  activeId,
  onSelect,
}: {
  items: SettingsWorkspaceNavItem[];
  activeId: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="sticky top-4 hidden space-y-1 rounded-xl border border-earth-200 bg-white p-2 md:block">
      {items.map((item) => {
        const cls =
          "block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-primary-100 " +
          (activeId === item.id
            ? "bg-primary-50 font-semibold text-primary-800"
            : "text-earth-600 hover:bg-earth-50");
        return item.href && !onSelect ? (
          <DashboardLink key={item.id} href={item.href} className={cls}>
            {item.label}{item.status ? <span className="ml-1 text-xs text-amber-700">{item.status}</span> : null}
          </DashboardLink>
        ) : (
          <button key={item.id} type="button" onClick={() => onSelect?.(item.id)} className={cls}>
            {item.label}{item.status ? <span className="ml-1 text-xs text-amber-700">{item.status}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function SettingsWorkspaceFrame({
  nav,
  header,
  children,
}: {
  nav: ReactNode;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-3 md:grid-cols-[170px_minmax(0,1fr)]">
      <nav aria-label="設定分類" className="min-w-0">{nav}</nav>
      <div className="min-w-0 rounded-xl border border-earth-200 bg-white px-4 py-1 sm:px-5">
        {header ? <div className="border-b border-earth-100 py-2.5 text-sm text-earth-500">{header}</div> : null}
        {children}
      </div>
    </div>
  );
}

export function SettingsListRow({
  title,
  summary,
  href,
  action = "設定",
  controls,
  columns,
  expanded,
  keepMounted = false,
  onEdit,
  children,
}: {
  title: string;
  summary: string;
  columns?: Array<{ label: string; content: ReactNode }>;
  href?: string;
  action?: string;
  controls?: ReactNode;
  expanded?: boolean;
  keepMounted?: boolean;
  onEdit?: () => void;
  children?: ReactNode;
}) {
  const showChildren = expanded === undefined ? true : expanded;
  return (
    <section className="min-w-0 border-b border-earth-100 last:border-0">
      <div className={columns ? "grid min-h-16 items-center gap-3 py-2 md:grid-cols-[minmax(180px,1.5fr)_minmax(0,3fr)_100px]" : "grid min-h-16 items-center gap-4 py-2 md:grid-cols-[200px_minmax(0,1fr)_200px]"}>
        <h3 title={title} className="truncate text-sm font-semibold text-primary-900">{title}</h3>
        {columns ? <div className="grid min-w-0 grid-cols-2 gap-3 text-sm sm:grid-cols-3">{columns.map(column => <div key={column.label} className="min-w-0"><p className="mb-1 text-earth-500 md:sr-only">{column.label}</p>{column.content}</div>)}</div> : <p className="min-w-0 truncate text-sm tabular-nums text-earth-600" title={summary}>{summary}</p>}
        <div className={`flex items-center justify-end gap-2 ${columns ? "" : "w-[200px]"}`}>
          {controls}
          {onEdit && (!expanded || columns) ? (
            <button
              type="button"
              onClick={onEdit}
              aria-expanded={expanded}
              className="inline-flex min-h-10 min-w-24 items-center justify-center rounded-lg border border-earth-200 px-3 text-sm font-medium text-primary-700 hover:bg-earth-50 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              {expanded ? "收合" : "修改"}
            </button>
          ) : null}
          {href ? (
            <DashboardLink
              href={href}
              aria-label={`開啟${title}`}
              className="inline-flex min-h-10 min-w-24 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-earth-200 px-3 text-sm font-medium text-primary-700 hover:bg-earth-50 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              {action}
            </DashboardLink>
          ) : null}
        </div>
      </div>
      {(showChildren || keepMounted) && children ? (
        <div hidden={!showChildren} className={`border-t border-earth-100 pb-3 pt-3 ${columns ? "" : "md:ml-[216px]"}`}>{children}</div>
      ) : null}
    </section>
  );
}

export function SettingsModuleWorkspace({
  moduleLabel,
  storeName,
  sections,
  initialSection,
}: {
  moduleLabel: string;
  storeName: string;
  sections: Array<{ id: string; label: string; content: ReactNode }>;
  initialSection?: string;
}) {
  const validIds = useMemo(() => new Set(sections.map(section => section.id)), [sections]);
  const firstId = sections[0]?.id ?? "";
  const [activeId, setActiveId] = useState(
    initialSection && validIds.has(initialSection) ? initialSection : firstId,
  );
  const active = sections.find(section => section.id === activeId) ?? sections[0];

  if (!active) return null;

  return (
    <SettingsWorkspaceFrame
      nav={
        <>
          <label className="block text-sm md:hidden">
            設定分類
            <select
              value={active.id}
              onChange={event => setActiveId(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-lg border bg-white px-3"
            >
              {sections.map(section => (
                <option key={section.id} value={section.id}>{section.label}</option>
              ))}
            </select>
          </label>
          <SettingsWorkspaceNav
            items={sections.map(section => ({ id: section.id, label: section.label }))}
            activeId={active.id}
            onSelect={setActiveId}
          />
        </>
      }
      header={`${storeName} · ${moduleLabel}`}
    >
      <section aria-label={active.label}>{active.content}</section>
    </SettingsWorkspaceFrame>
  );
}
