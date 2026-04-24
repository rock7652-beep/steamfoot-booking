"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { initiateCustomerPlanPurchase } from "@/server/actions/wallet";

interface Props {
  planId: string;
  /** 路徑前綴（例：/s/zhubei），client 端接上 /book/shop/thank-you?txId=... */
  routePrefix: string;
}

export function PurchaseButton({ planId, routePrefix }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit() {
    startTransition(async () => {
      const result = await initiateCustomerPlanPurchase({ planId });
      if (result.success) {
        toast.success("已送出購買申請");
        router.push(`${routePrefix}/book/shop/thank-you?txId=${result.data.transactionId}`);
      } else {
        toast.error(result.error ?? "送出失敗，請稍後再試");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleSubmit}
      disabled={pending}
      className="w-full rounded-lg bg-primary-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
    >
      {pending ? "送出中..." : "送出購買申請"}
    </button>
  );
}
