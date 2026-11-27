"use client";

import { useState } from "react";
import { CashDrawerActionForm, type CashDrawerFormAction } from "./cash-drawer-action-form";

export function WithdrawalAmountForm({ action, originalAmount, returnPath }: {
  action: CashDrawerFormAction;
  originalAmount: string;
  returnPath: string;
}) {
  const [amount, setAmount] = useState(originalAmount);

  return (
    <details className="mt-1">
      <summary className="min-h-[44px] cursor-pointer py-3 font-medium text-earth-700 hover:text-earth-900">
        修改提領金額
      </summary>
      <CashDrawerActionForm
        action={action}
        returnPath={returnPath}
        submitLabel="儲存金額"
        className="space-y-3"
        submitClassName="min-h-[44px] w-full sm:w-auto"
      >
        <label className="block font-medium text-earth-700">
          新金額（NT$）
          <input
            type="number"
            inputMode="numeric"
            name="amount"
            required
            min={1}
            max={9_999_999_999}
            step={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-1 block min-h-[44px] w-full max-w-xs rounded-lg border border-earth-300 px-3 py-2 text-base tabular-nums"
          />
        </label>
      </CashDrawerActionForm>
    </details>
  );
}
