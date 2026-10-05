"use client";

import { useState } from "react";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { fetchTransactionDetailDTO } from "@/server/actions/transaction";
import { TransactionDrawer } from "./TransactionDrawer";

// ============================================================
// 交易列表的「⋯」按鈕，點擊滑出右側 Drawer
// ============================================================

interface RowActionsProps {
  transactionId: string;
  staffOptions: Array<{ id: string; displayName: string }>;
  canVoid: boolean;
  canEdit: boolean;
  canRefund: boolean;
}

export function TransactionRowActions({
  transactionId,
  staffOptions,
  canVoid,
  canEdit,
  canRefund,
}: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const reader = usePanelReader("transaction-detail", fetchTransactionDetailDTO);
  const prefetch = () => reader.prefetch(transactionId);

  return (
    <>
      <button
        type="button"
        onPointerEnter={prefetch}
        onFocus={prefetch}
        onTouchStart={prefetch}
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
          canRefund={canRefund}
        />
      )}
    </>
  );
}
