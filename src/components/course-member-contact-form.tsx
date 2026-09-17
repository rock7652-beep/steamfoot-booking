"use client";

import { useState, useTransition } from "react";
import { saveCourseMemberContact } from "@/server/actions/course-member-contact";

export function CourseMemberContactForm({ initial }: { initial: {
  emergencyContactName: string | null; emergencyContactPhone: string | null;
} }) {
  const [name, setName] = useState(initial.emergencyContactName ?? "");
  const [phone, setPhone] = useState(initial.emergencyContactPhone ?? "");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return <details className="border-t border-earth-200 px-4 py-2">
    <summary className="min-h-11 cursor-pointer py-3 text-sm">緊急聯絡人</summary>
    <form className="space-y-3 pb-3" onSubmit={event => {
      event.preventDefault(); if (pending) return; setMessage("");
      start(async () => {
        try {
          const result = await saveCourseMemberContact({ emergencyContactName: name, emergencyContactPhone: phone });
          setMessage(result.success ? "已儲存緊急聯絡資料" : result.error);
        } catch { setMessage("連線失敗，已保留輸入內容，請重試"); }
      });
    }}>
      <p className="text-sm text-earth-500">供本店必要時聯繫，不會提供給共卡成員。</p>
      <label className="block text-sm">聯絡人姓名<input className="mt-1 min-h-11 w-full rounded-lg border p-2 text-base" value={name} onChange={event=>setName(event.target.value)} maxLength={100} autoComplete="off" disabled={pending}/></label>
      <label className="block text-sm">聯絡人電話<input className="mt-1 min-h-11 w-full rounded-lg border p-2 text-base" type="tel" value={phone} onChange={event=>setPhone(event.target.value)} maxLength={30} autoComplete="off" disabled={pending}/></label>
      {message && <p role="status" className="text-sm">{message}</p>}
      <button className="min-h-11 w-full rounded-lg bg-primary-700 px-4 text-white disabled:opacity-50" disabled={pending}>{pending ? "儲存中…" : "儲存緊急聯絡人"}</button>
    </form>
  </details>;
}
