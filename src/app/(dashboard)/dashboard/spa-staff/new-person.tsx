"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import {
  createSpaPersonFromMember,
  linkSpaPersonToMember,
  searchSpaStaffMembers,
} from "@/server/actions/spa-person";

type MemberResult = {
  customerId: string;
  name: string;
  maskedPhone: string;
  lineLinked: boolean;
  staffId: string | null;
  workAccess: boolean;
};

export function NewSpaPerson({ onCreated, staffId }: {
  onCreated: (id: string, name: string) => void;
  staffId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<MemberResult[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setQuery("");
    setMembers([]);
    setError("");
    setNotice("");
  }

  function search() {
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await searchSpaStaffMembers({ query });
      if (!result.success) return setError(result.error);
      setMembers(result.members);
      if (!result.members.length) setNotice("找不到可加入的本店會員，請先完成會員註冊與 LINE 綁定。");
    });
  }

  function select(member: MemberResult) {
    setError("");
    startTransition(async () => {
      if (staffId) {
        const result = await linkSpaPersonToMember({ staffId, customerId: member.customerId });
        if (!result.success) return setError(result.error);
        onCreated(staffId, result.name);
      } else {
        const result = await createSpaPersonFromMember({ customerId: member.customerId, requestKey: crypto.randomUUID() });
        if (!result.success) return setError(result.error);
        onCreated(result.staffId, result.name);
      }
      setOpen(false);
      router.refresh();
    });
  }

  return <>
    <button type="button" className="rounded-lg bg-earth-800 px-4 py-3 text-sm font-medium text-white" onClick={() => setOpen(true)}>
      {staffId ? "連結會員" : "＋新增人員"}
    </button>
    <RightSheet presentation="centered" open={open} onClose={close} labelledById="spa-member-staff-title">
      <header className="flex items-center justify-between border-b border-earth-200 p-5">
        <div><h2 id="spa-member-staff-title" className="text-xl font-bold">{staffId ? "連結既有人員" : "從本店會員加入人員"}</h2><p className="mt-1 text-sm text-earth-500">沿用會員姓名與 LINE 登入；加入後可查看自己的工作。</p></div>
        <button aria-label="關閉" disabled={pending} onClick={close}>✕</button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); search(); }}>
          <label className="sr-only" htmlFor="spa-member-search">搜尋會員</label>
          <input id="spa-member-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="輸入會員姓名或手機" maxLength={60} className="min-w-0 flex-1 rounded-lg border border-earth-200 p-3" />
          <button disabled={pending || !query.trim()} className="rounded-lg bg-earth-800 px-4 text-white disabled:opacity-50">{pending ? "處理中…" : "搜尋"}</button>
        </form>
        {notice && <p role="status" className="rounded-lg bg-earth-50 p-3 text-sm text-earth-600">{notice}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="space-y-2">{members.map((member) => <button key={member.customerId} type="button" disabled={pending || (member.workAccess && member.staffId !== staffId)} onClick={() => select(member)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-earth-200 p-4 text-left disabled:bg-earth-50 disabled:opacity-60"><span><strong className="block text-earth-900">{member.name}</strong><span className="mt-1 block text-sm text-earth-500">{member.maskedPhone}</span></span><span className="text-right text-xs text-earth-500"><span className="block">LINE {member.lineLinked ? "已綁定" : "未綁定"}</span><span className="mt-1 block font-medium text-primary-700">{member.workAccess ? "已是服務人員" : staffId ? "連結此會員" : "加入服務人員"}</span></span></button>)}</div>
        <p className="text-xs leading-5 text-earth-500">加入不會開放接單；仍需設定可提供服務與班表。停用工作權限不影響顧客身分、方案或歷史預約。</p>
      </div>
    </RightSheet>
  </>;
}
