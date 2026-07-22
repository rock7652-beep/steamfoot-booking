"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import type { CustomerLoginMethods } from "@/server/queries/customer-login-methods";
import { beginOAuthAccountLinkAction } from "@/server/actions/account-link";
import {
  replacePhoneLoginAction,
  unlinkLoginMethodAction,
} from "@/server/actions/login-method-management";

export function LoginMethodsCard({
  methods,
}: {
  methods: CustomerLoginMethods;
}) {
  const [loading, setLoading] = useState<"google" | "line" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [phoneEditor, setPhoneEditor] = useState(false);

  async function linkProvider(provider: "google" | "line", replace = false) {
    setLoading(provider);
    setError(null);
    try {
      const result = await beginOAuthAccountLinkAction(provider, replace ? "replace" : "link");
      if (!result.ok) {
        setError(result.message);
        setLoading(null);
        return;
      }
      await signIn(provider, { callbackUrl: "/profile?link=success" });
    } catch {
      setError("無法開始安全補綁，請稍後再試");
      setLoading(null);
    }
  }

  async function unlink(method: "phone" | "google" | "line") {
    if (!window.confirm("確定解除這個登入方式？系統會確認您仍保有其他登入方式。")) return;
    setError(null);
    setNotice(null);
    const result = await unlinkLoginMethodAction(method);
    if (!result.ok) return setError(result.message);
    setNotice("登入方式已解除");
    window.location.reload();
  }

  async function replacePhone(formData: FormData) {
    setError(null);
    setNotice(null);
    const result = await replacePhoneLoginAction({
      phone: String(formData.get("newPhone") ?? ""),
      phoneConfirmation: String(formData.get("newPhoneConfirmation") ?? ""),
      currentPassword: String(formData.get("currentPassword") ?? ""),
    });
    if (!result.ok) return setError(result.message);
    setNotice("手機登入號碼已更換");
    window.location.reload();
  }

  return (
    <section className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-earth-900">登入方式</h2>
      <p className="mt-2 text-sm leading-relaxed text-earth-600">
        您可以查看目前已連結的登入方式。基於安全考量，帳號資料只顯示部分內容。
      </p>

      <div className="mt-5 divide-y divide-earth-200 rounded-xl border border-earth-200 px-4">
        <MethodRow
          label="手機＋密碼"
          linked={methods.phone.linked}
          detail={
            methods.phone.linked
              ? methods.phone.maskedValue ?? "已設定"
              : methods.phone.maskedValue
                ? "手機已登記，尚未設定登入密碼"
                : "尚未設定"
          }
          action={
            methods.phone.linked ? (
              <MethodActions
                onReplace={() => setPhoneEditor((value) => !value)}
                onUnlink={() => unlink("phone")}
              />
            ) : (
              <a
                href="#phone-login-settings"
                className="rounded-lg border border-earth-300 px-3 py-2 text-sm font-semibold text-earth-800 hover:bg-earth-50"
              >
                設定
              </a>
            )
          }
        />
        <MethodRow
          label="Google"
          linked={methods.google.linked}
          detail={methods.google.maskedValue ?? (methods.google.linked ? "已連結" : "尚未連結")}
          action={
            methods.google.linked ? (
              <MethodActions
                onReplace={() => linkProvider("google", true)}
                onUnlink={() => unlink("google")}
                disabled={loading !== null}
              />
            ) : (
              <LinkButton
                disabled={loading !== null}
                onClick={() => linkProvider("google")}
              >
                {loading === "google" ? "驗證中…" : "安全補綁"}
              </LinkButton>
            )
          }
        />
        <MethodRow
          label="LINE"
          linked={methods.line.linked}
          detail={methods.line.linked ? "已連結" : "尚未連結"}
          action={
            methods.line.linked ? (
              <MethodActions
                onReplace={() => linkProvider("line", true)}
                onUnlink={() => unlink("line")}
                disabled={loading !== null}
              />
            ) : (
              <LinkButton
                disabled={loading !== null}
                onClick={() => linkProvider("line")}
              >
                {loading === "line" ? "驗證中…" : "安全補綁"}
              </LinkButton>
            )
          }
        />
      </div>

      {phoneEditor && (
        <form action={replacePhone} className="mt-4 space-y-3 rounded-xl border border-earth-200 bg-earth-50 p-4">
          <p className="font-semibold text-earth-900">更換手機登入號碼</p>
          <p className="text-sm text-earth-600">目前尚未使用簡訊驗證，請輸入目前密碼，並將新號碼輸入兩次確認。</p>
          <input name="newPhone" type="tel" inputMode="numeric" required pattern="09[0-9]{8}" maxLength={10} placeholder="新手機號碼" className="h-11 w-full rounded-lg border border-earth-300 px-3" />
          <input name="newPhoneConfirmation" type="tel" inputMode="numeric" required pattern="09[0-9]{8}" maxLength={10} placeholder="再次輸入新手機號碼" className="h-11 w-full rounded-lg border border-earth-300 px-3" />
          <input name="currentPassword" type="password" required placeholder="目前登入密碼" autoComplete="current-password" className="h-11 w-full rounded-lg border border-earth-300 px-3" />
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white">確認更換</button>
            <button type="button" onClick={() => setPhoneEditor(false)} className="rounded-lg border border-earth-300 px-4 py-2 text-sm">取消</button>
          </div>
        </form>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-4 text-sm text-green-700">{notice}</p>}
      <p className="mt-4 text-sm leading-relaxed text-earth-500">
        補綁時會前往 Google 或 LINE 驗證本人。若該登入方式已屬於其他會員，系統會安全阻擋，不會覆蓋帳號。
      </p>
    </section>
  );
}

function MethodActions({
  onReplace,
  onUnlink,
  disabled = false,
}: {
  onReplace: () => void;
  onUnlink: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 gap-2">
      <button type="button" disabled={disabled} onClick={onReplace} className="rounded-lg border border-earth-300 px-3 py-2 text-sm font-semibold text-earth-800 disabled:opacity-60">更換</button>
      <button type="button" disabled={disabled} onClick={onUnlink} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-60">解除</button>
    </div>
  );
}

function LinkButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="rounded-lg border border-earth-300 px-3 py-2 text-sm font-semibold text-earth-800 hover:bg-earth-50 disabled:opacity-60"
      {...props}
    />
  );
}
function MethodRow({
  label,
  linked,
  detail,
  action,
}: {
  label: string;
  linked: boolean;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-20 items-center gap-3 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-earth-900">{label}</p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              linked
                ? "bg-green-50 text-green-700"
                : "bg-earth-100 text-earth-600"
            }`}
          >
            {linked ? "已連結" : "未連結"}
          </span>
        </div>
        <p className="mt-1 break-all text-sm text-earth-600">{detail}</p>
      </div>
      {action}
    </div>
  );
}
