"use client";

import { useEffect, useRef, useState } from "react";
import { DataTable, type Column } from "@/components/desktop";
import { CareRowActions } from "./care-row-actions";

const DEFAULT_VISIBLE_COUNT = 3;

export interface CareItem {
  customerId: string;
  name: string;
  phoneMasked: string;
  reason: string;
  meta: string | null;
  staffName: string | null;
  lastFollowUpText: string | null;
  script: string;
  readOnly?: boolean;
}

interface CareSectionProps {
  title: string;
  description: string;
  emptyText: string;
  items: CareItem[];
  totalCount: number;
}

const columns: Column<CareItem>[] = [
  {
    key: "customer",
    header: "顧客",
    priority: "primary",
    accessor: (row) => (
      <div className="flex flex-col">
        <span className="text-[15px] font-semibold text-earth-900">{row.name}</span>
        <span className="text-[10px] tabular-nums text-earth-400">{row.phoneMasked}</span>
      </div>
    ),
    width: "w-40",
  },
  {
    key: "reason",
    header: "提醒原因",
    accessor: (row) => (
      <div className="flex flex-col">
        <span className="text-sm text-earth-800">{row.reason}</span>
        {row.meta ? <span className="text-[11px] text-earth-500">{row.meta}</span> : null}
        {row.lastFollowUpText ? (
          <span className="text-[11px] text-earth-500">{row.lastFollowUpText}</span>
        ) : null}
      </div>
    ),
  },
  {
    key: "staff",
    header: "直屬店長",
    priority: "secondary",
    accessor: (row) =>
      row.staffName ? (
        <span className="text-xs text-earth-700">{row.staffName}</span>
      ) : (
        <span className="text-xs text-earth-400">未指派</span>
      ),
    width: "w-24",
  },
  {
    key: "actions",
    header: <span className="sr-only">操作</span>,
    align: "right",
    noLink: true,
    accessor: (row) => (
      <CareRowActions customerId={row.customerId} script={row.script} readOnly={row.readOnly} />
    ),
    width: "w-[280px]",
  },
];

export function CareSection({
  title,
  description,
  emptyText,
  items,
  totalCount,
}: CareSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canToggle = items.length > DEFAULT_VISIBLE_COUNT;
  const visibleItems = expanded || !canToggle ? items : items.slice(0, DEFAULT_VISIBLE_COUNT);
  const hiddenCount = Math.max(0, items.length - DEFAULT_VISIBLE_COUNT);

  useEffect(
    () => () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    },
    [],
  );

  function toggleExpanded() {
    if (transitioning) return;
    setTransitioning(true);
    transitionTimer.current = setTimeout(() => {
      setExpanded((value) => !value);
      transitionTimer.current = setTimeout(() => setTransitioning(false), 140);
    }, 120);
  }

  return (
    <section className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-earth-900">
          {title}
          {totalCount > 0 ? (
            <span className="ml-1.5 text-[11px] font-normal text-earth-500">{totalCount} 位</span>
          ) : null}
        </h2>
        {canToggle ? (
          <div className="flex shrink-0 items-center gap-2 text-[11px]">
            {!expanded ? <span className="text-earth-400">還有 {hiddenCount} 位</span> : null}
            {!expanded ? <span className="text-earth-300">｜</span> : null}
            <button
              type="button"
              onClick={toggleExpanded}
              disabled={transitioning}
              aria-expanded={expanded}
              className="rounded-md px-2 py-0.5 font-medium text-primary-700 transition hover:bg-primary-50 hover:text-primary-800 disabled:cursor-wait disabled:opacity-70"
            >
              {expanded ? "收合" : "查看全部 →"}
            </button>
          </div>
        ) : null}
      </div>
      <p className="text-[11px] text-earth-500">{description}</p>
      <div
        className={`transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
          transitioning ? "translate-y-1 opacity-60" : "translate-y-0 opacity-100"
        }`}
      >
        <DataTable
          className="[&_th]:py-1.5 [&_tr]:h-10"
          columns={columns}
          rows={visibleItems}
          rowKey={(r) => r.customerId}
          empty={
            <div className="px-4 py-4 text-center">
              <p className="text-sm text-earth-600">{emptyText}</p>
            </div>
          }
        />
      </div>
    </section>
  );
}
