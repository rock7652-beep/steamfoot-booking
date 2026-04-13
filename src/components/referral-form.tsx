"use client";

import { useState, useTransition } from "react";
import { createReferral } from "@/server/actions/referral";
import { toast } from "sonner";

interface Props {
  referrerId: string;
  onClose: () => void;
}

export function ReferralFormDialog({ referrerId, onClose }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createReferral({
        referrerId,
        referredName: name.trim(),
        referredPhone: phone.trim() || undefined,
        note: note.trim() || undefined,
      });
      if (result.success) {
        toast.success("轉介紹已登記（+10 積分）");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
        <h3 className="text-sm font-semibold text-earth-800">新增轉介紹</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs text-earth-500">被介紹人姓名 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={50}
              className="mt-1 w-full rounded-md border border-earth-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="姓名"
            />
          </div>
          <div>
            <label className="block text-xs text-earth-500">手機（選填）</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-md border border-earth-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="09xxxxxxxx"
            />
          </div>
          <div>
            <label className="block text-xs text-earth-500">備註（選填）</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              className="mt-1 w-full rounded-md border border-earth-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="備註"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-md px-3 py-1.5 text-xs text-earth-500 hover:bg-earth-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              className="rounded-md bg-primary-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {isPending ? "登記中…" : "登記轉介紹"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
