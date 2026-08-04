"use client";

import { useActionState } from "react";
import { taichungFirstActivationAction, type TaichungFirstActivationState } from "@/server/actions/taichung-provider-first-activation";

const initialState: TaichungFirstActivationState = { error: null };

export function ActivationForm({ customerId, phone }: { customerId: string; phone: string }) {
  const [state, action, pending] = useActionState<TaichungFirstActivationState, FormData>(taichungFirstActivationAction, initialState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="phone" value={phone} />
      <div className="rounded-md bg-earth-50 px-3 py-2"><p className="text-xs text-earth-500">已確認手機號碼</p><p className="font-medium text-earth-800">*******{phone.slice(-3)}</p></div>
      <div><label htmlFor="password" className="block text-xs font-medium text-earth-700">設定登入密碼</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required disabled={pending} className="mt-1 w-full rounded-md border border-earth-300 px-3 py-2 text-sm" /></div>
      <div><label htmlFor="confirmPassword" className="block text-xs font-medium text-earth-700">確認登入密碼</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required disabled={pending} className="mt-1 w-full rounded-md border border-earth-300 px-3 py-2 text-sm" /></div>
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? "啟用中⋯" : "完成首次啟用"}</button>
    </form>
  );
}
