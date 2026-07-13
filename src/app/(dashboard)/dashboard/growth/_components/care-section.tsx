"use client";

import { useState } from "react";
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
  lastFollowUpText: string;
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
        <span className="text-sm font-medium text-earth-900">{row.name}</span>
        <span className="text-[11px] tabular-nums text-earth-500">{row.phoneMasked}</span>
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
        <span className="text-[11px] text-earth-500">{row.lastFollowUpText}</span>
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
  const canToggle = items.length > DEFAULT_VISIBLE_COUNT;
  const visibleItems = expanded || !canToggle ? items : items.slice(0, DEFAULT_VISIBLE_COUNT);
  const hiddenCount = Math.max(0, items.length - DEFAULT_VISIBLE_COUNT);

  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-earth-900">
          {title}
          {totalCount > 0 ? (
            <span className="ml-1.5 text-[11px] font-normal text-earth-500">{totalCount} 位</span>
          ) : null}
        </h2>
      </div>
      <p className="text-[11px] text-earth-500">{description}</p>
      <DataTable
        columns={columns}
        rows={visibleItems}
        rowKey={(r) => r.customerId}
        empty={
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-earth-600">{emptyText}</p>
          </div>
        }
      />
      {canToggle ? (
        <div className="flex items-center justify-end gap-2 px-1 text-[11px]">
          {!expanded ? <span className="text-earth-400">還有 {hiddenCount} 位</span> : null}
          {!expanded ? <span className="text-earth-300">｜</span> : null}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-md px-2 py-1 font-medium text-primary-700 transition hover:bg-primary-50 hover:text-primary-800"
          >
            {expanded ? "收合" : "查看全部 →"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
