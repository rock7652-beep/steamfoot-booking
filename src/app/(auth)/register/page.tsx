"use client";

import { useActionState, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { customerRegisterAction, type RegisterState } from "@/server/actions/customer-auth";
import Link from "next/link";

type FieldErrors = {
  name?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
};

const validateName = (v: string) => (v.trim() ? undefined : "請輸入姓名");
const validatePhone = (v: string) =>
  !v
    ? "請輸入手機號碼"
    : !/^09\d{8}$/.test(v)
      ? "請輸入正確手機號碼（09 開頭 10 碼）"
      : undefined;
const validatePassword = (v: string) =>
  !v
    ? "請輸入密碼"
    : !/^\d{6,}$/.test(v)
      ? "密碼需為純數字，至少 6 碼"
      : undefined;
const validateConfirm = (pw: string, cpw: string) =>
  !cpw ? "請再次輸入密碼" : pw !== cpw ? "兩次密碼不一致" : undefined;

export default function RegisterPage() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(
    customerRegisterAction,
    { error: null }
  );
  const [referrerId, setReferrerId] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  // B7-4: 從 URL 路徑讀取 storeSlug
  const storeSlug = typeof window !== "undefined"
    ? window.location.pathname.match(/^\/s\/([^/]+)/)?.[1] ?? "zhubei"
    : "zhubei";
  const prefix = `/s/${storeSlug}`;

  // B8: 讀取推薦人 ID（從 URL ?ref= 或 localStorage）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      localStorage.setItem("referrerId", ref);
      setReferrerId(ref);
    } else {
      const stored = localStorage.getItem("referrerId");
      if (stored) setReferrerId(stored);
    }
  }, []);

  // 若後台建立的顧客，導向開通頁面
  useEffect(() => {
    if (state.error === "NEEDS_ACTIVATION") {
      router.push(`${prefix}/activate?phone=${encodeURIComponent(phone)}`);
    }
  }, [state.error, router, prefix, phone]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    const next: FieldErrors = {
      name: validateName(name),
      phone: validatePhone(phone),
      password: validatePassword(password),
      confirmPassword: validateConfirm(password, confirmPassword),
    };
    if (next.name || next.phone || next.password || next.confirmPassword) {
      e.preventDefault();
      setErrors(next);
    }
  };

  const inputBase =
    "mt-1 block w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-1";
  const inputOk = "border-earth-300 focus:border-primary-500 focus:ring-primary-500";
  const inputErr = "border-red-400 focus:border-red-500 focus:ring-red-500";

  return (
    <div
      className="w-full max-w-sm"
      style={{ paddingBottom: "max(6rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-earth-900">註冊新帳號</h1>
        <p className="mt-1 text-sm text-earth-500">蒸足健康站會員</p>
      </div>

      <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
        <p className="mb-4 text-xs text-earth-500">
          <span className="text-red-500">*</span> 為必填欄位
        </p>

        <form action={formAction} onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* B8: 推薦人 hidden field */}
          {referrerId && <input type="hidden" name="referrerId" value={referrerId} />}

          {state.error && state.error !== "NEEDS_ACTIVATION" && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {state.error}
            </p>
          )}

          {/* 姓名 */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-earth-700">
              姓名 <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
              }}
              onBlur={() => setErrors((p) => ({ ...p, name: validateName(name) }))}
              placeholder="請輸入姓名"
              className={`${inputBase} ${errors.name ? inputErr : inputOk}`}
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
          </div>

          {/* 手機 */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-earth-700">
              手機號碼 <span className="text-red-500">*</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              maxLength={10}
              onChange={(e) => {
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                if (errors.phone) setErrors((p) => ({ ...p, phone: undefined }));
              }}
              onBlur={() => setErrors((p) => ({ ...p, phone: validatePhone(phone) }))}
              placeholder="0912345678"
              className={`${inputBase} ${errors.phone ? inputErr : inputOk}`}
              aria-invalid={!!errors.phone}
            />
            {errors.phone ? (
              <p className="mt-1 text-xs text-red-600">{errors.phone}</p>
            ) : (
              <p className="mt-1 text-xs text-earth-400">此為登入帳號，09 開頭共 10 碼</p>
            )}
          </div>

          {/* 密碼 */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-earth-700">
              密碼 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPw ? "text" : "password"}
                inputMode="numeric"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                }}
                onBlur={() =>
                  setErrors((p) => ({ ...p, password: validatePassword(password) }))
                }
                placeholder="至少 6 位數字"
                className={`${inputBase} pr-10 ${errors.password ? inputErr : inputOk}`}
                aria-invalid={!!errors.password}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-earth-400 hover:text-earth-600"
                aria-label={showPw ? "隱藏密碼" : "顯示密碼"}
                tabIndex={-1}
              >
                {showPw ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password}</p>
            )}
          </div>

          {/* 確認密碼 */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-earth-700">
              確認密碼 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPw ? "text" : "password"}
                inputMode="numeric"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword)
                    setErrors((p) => ({ ...p, confirmPassword: undefined }));
                }}
                onBlur={() =>
                  setErrors((p) => ({
                    ...p,
                    confirmPassword: validateConfirm(password, confirmPassword),
                  }))
                }
                placeholder="再次輸入密碼"
                className={`${inputBase} pr-10 ${errors.confirmPassword ? inputErr : inputOk}`}
                aria-invalid={!!errors.confirmPassword}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPw((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-earth-400 hover:text-earth-600"
                aria-label={showConfirmPw ? "隱藏密碼" : "顯示密碼"}
                tabIndex={-1}
              >
                {showConfirmPw ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-red-600">{errors.confirmPassword}</p>
            )}
          </div>

          {/* 基本資料（必填，除備註外） */}
          <div className="border-t border-earth-200 pt-4 space-y-4">
            <div>
              <label htmlFor="gender" className="block text-sm font-medium text-earth-700">
                性別 <span className="text-red-500">*</span>
              </label>
              <select
                id="gender"
                name="gender"
                required
                defaultValue=""
                className={`${inputBase} ${inputOk}`}
              >
                <option value="" disabled>請選擇</option>
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">其他</option>
              </select>
            </div>

            <div>
              <label htmlFor="birthday" className="block text-sm font-medium text-earth-700">
                生日 <span className="text-red-500">*</span>
              </label>
              <input
                id="birthday"
                name="birthday"
                type="date"
                required
                className={`${inputBase} ${inputOk}`}
              />
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-earth-700">
                備註（選填）
              </label>
              <input
                id="notes"
                name="notes"
                type="text"
                placeholder="選填"
                className={`${inputBase} ${inputOk}`}
              />
            </div>
          </div>

          <p className="rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-700">
            完成註冊後，我們會透過 LINE 通知你預約資訊
          </p>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {pending ? "註冊中..." : "註冊"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href={`${prefix}/`} className="text-sm text-earth-500 hover:text-earth-700">
            已有帳號？立即登入
          </Link>
        </div>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
