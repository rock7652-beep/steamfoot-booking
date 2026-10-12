"use client";
import { useState, type FormEvent } from "react";
import { normalizePhone } from "@/lib/normalize";
import { memberConnectionCommand } from "@/lib/store-member-connection";

export function MemberConnectionEntry({ slug, basicId, linked = false }: { slug: string; basicId: string | null; linked?: boolean }) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  if (linked) return <p role="status">本店會員已連結，不需再次填寫。通知將依本店 LINE 狀態發送。</p>;
  if (!basicId) return <p role="status">本店 LINE 連結尚未設定，請由門市協助。</p>;
  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizePhone(phone);
    if (!/^09\d{8}$/.test(normalized)) { setError("請填寫有效手機號碼"); return; }
    setError(null);
    setOpened(true);
    window.location.assign(`https://line.me/R/oaMessage/${encodeURIComponent(basicId!)}/?${encodeURIComponent(memberConnectionCommand(slug, normalized))}`);
  }
  return <form onSubmit={submit} className="space-y-4"><label className="block space-y-2"><span>手機號碼</span><input type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={e => setPhone(e.target.value)} className="min-h-12 w-full rounded-lg border border-earth-300 px-3 text-base" /></label><p className="text-sm text-earth-600">前往本店 LINE，送出預填訊息。首次由門市確認一次，之後直接沿用。</p>{opened && <p role="status" className="text-sm">請在 LINE 送出訊息；尚未送出與門市確認前，不算完成綁定。</p>}{error && <p role="alert" className="text-red-700">{error}</p>}<button className="min-h-12 w-full rounded-lg bg-primary-700 px-4 font-semibold text-white">前往本店 LINE</button></form>;
}
