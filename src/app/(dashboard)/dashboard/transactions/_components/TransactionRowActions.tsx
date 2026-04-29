"use client";

import { useState } from "react";
import { TransactionDrawer } from "./TransactionDrawer";

// ============================================================
// 交易列表的「⋯」按鈕，點擊滑出右側 Drawer
// ============================================================

interface RowActionsProps {
  transactionId: string;
  staffOptions: Array<{ id: string; displayName: string }>;
  canVoid: boolean;
  canEdit: boolean;
}

export function TransactionRowActions({
  transactionId,
  staffOptions,
  canVoid,
  canEdit,
}: RowActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="開啟交易詳情"
        className="rounded p-1 text-earth-400 hover:bg-earth-100 hover:text-earth-700"
      >
        <span className="text-lg leading-none">⋯</span>
      </button>
      {open && (
        <TransactionDrawer
          open={open}
          onClose={() => setOpen(false)}
          transactionId={transactionId}
          staffOptions={staffOptions}
          canVoid={canVoid}
          canEdit={canEdit}
        />
      )}
    </>
  );
}
