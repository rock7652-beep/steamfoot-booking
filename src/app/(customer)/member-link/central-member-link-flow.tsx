"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { beginOAuthAccountLinkAction } from "@/server/actions/account-link";
import { CentralMemberClaimForm } from "../profile/central-member-claim-form";

export function CentralMemberLinkFlow({
  hasLineAccount,
  hasCurrentMembership,
  membershipCount,
  callbackUrl,
}: {
  hasLineAccount: boolean;
  hasCurrentMembership: boolean;
  membershipCount: number;
  callbackUrl: string;
}) {
  const [linkingLine, setLinkingLine] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function linkLine() {
    setLinkingLine(true);
    setError(null);
    try {
      const result = await beginOAuthAccountLinkAction("line", "link");
      if (!result.ok) {
        setError(result.message);
        setLinkingLine(false);
        return;
      }
      await signIn("line", { callbackUrl });
    } catch {
      setError("無法開始 LINE 驗證，請稍後再試");
      setLinkingLine(false);
    }
  }

  if (!hasLineAccount) {
    return (
      <section className="rounded-2xl border border-primary-200 bg-white p-6 shadow-sm">
        <StepBadge step={1} label="驗證中央 LINE" />
        <h2 className="mt-3 text-xl font-bold text-earth-900">先確認是您本人</h2>
        <p className="mt-2 text-sm leading-relaxed text-earth-600">
          系統會前往 LINE Login 驗證，不會使用姓名或手機猜測身份，也不會更動門市方案、堂數或預約。
        </p>
        <button
          type="button"
          disabled={linkingLine}
          onClick={linkLine}
          className="mt-5 min-h-12 w-full rounded-xl bg-[#06C755] px-4 font-semibold text-white hover:bg-[#05b84e] disabled:opacity-60"
        >
          {linkingLine ? "前往 LINE 驗證中…" : "使用 LINE 驗證並繼續"}
        </button>
        {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      </section>
    );
  }

  if (!hasCurrentMembership) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <StepBadge step={2} label="確認門市會員" />
        <h2 className="mt-3 text-xl font-bold text-earth-900">還需要確認原門市資料</h2>
        <p className="mt-2 text-sm leading-relaxed text-earth-700">
          LINE 已驗證，但目前帳號還沒有任何可作為本人證明的門市會員。為避免只憑相同手機認領到別人的資料，系統不會自動連結。
        </p>
        <p className="mt-3 text-sm leading-relaxed text-earth-700">
          請先使用原本的手機與密碼登入；若沒有設定過密碼，再請門市協助確認一次即可。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-primary-200 bg-white p-6 shadow-sm">
      <StepBadge step={2} label="連結會員資料" />
      <h2 className="mt-3 text-xl font-bold text-earth-900">確認手機後自動連結</h2>
      <p className="mt-2 text-sm leading-relaxed text-earth-600">
        目前已連結 {membershipCount} 間門市。請輸入您留在門市的手機號碼；系統只會連結「手機完全相同、每店唯一、且尚未屬於其他帳號」的會員資料。
      </p>
      <div className="mt-5">
        <CentralMemberClaimForm />
      </div>
    </section>
  );
}

function StepBadge({ step, label }: { step: number; label: string }) {
  return (
    <p className="inline-flex rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
      步驟 {step}・{label}
    </p>
  );
}
