import type { ReactNode } from 'react';
import Link from 'next/link';
import { signOut } from '@/lib/auth';
export function ReferralQaShell({children}:{children:ReactNode}){
 return <main className="mx-auto w-full max-w-6xl space-y-5 p-4 text-earth-900 sm:p-6"><aside className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-base"><p className="font-semibold">推薦功能隔離測試・只會修改測試店資料，不會扣款或發送通知。</p><nav className="flex flex-wrap items-center gap-4"><Link className="min-h-11 underline" href="/referral-test">測試說明與帳號</Link><Link className="min-h-11 underline" href="/hq/login?intent=subscription-referral">切換帳號前請先登出</Link><form action={async()=>{'use server';await signOut({redirectTo:'/referral-test'});}}><button className="min-h-11 rounded-lg border border-earth-300 bg-white px-4">登出目前帳號</button></form></nav></aside>{children}</main>;
}
