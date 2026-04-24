"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { resetStaffPasswordAction } from "@/server/actions/staff";

interface ResetPasswordButtonProps {
  userId: string;
  displayName: string;
}

export function ResetPasswordButton({ userId, displayName }: ResetPasswordButtonProps) {
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const backdropRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  function closeModal() {
    if (isPending) return;
    setOpen(false);
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("新密碼至少需要 8 碼");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("兩次輸入的密碼不一致");
      return;
    }

    startTransition(async () => {
      try {
        const result = await resetStaffPasswordAction({ userId, newPassword });
        if (!result.success) {
          setError(result.error || "重設密碼失敗");
          return;
        }
        toast.success("已重設該員工密碼");
        setOpen(false);
        setNewPassword("");
        setConfirmPassword("");
        router.refresh();
      } catch {
        setError("重設密碼失敗，請稍後再試");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50"
      >
        重設密碼
      </button>

      {open && (
        <div
          ref={backdropRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-earth-900/30 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === backdropRef.current) closeModal();
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-earth-200 bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-base font-bold text-earth-900">重設密碼</h2>
            <p className="mb-4 text-xs text-earth-500">
              將為「{displayName}」設定新的登入密碼
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label
                  htmlFor="rp-new"
                  className="block text-xs font-medium text-earth-700"
                >
                  新密碼
                </label>
                <input
                  id="rp-new"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <p className="mt-1 text-[10px] text-earth-400">
                  至少 8 碼，建議混用英文與數字
                </p>
              </div>

              <div>
                <label
                  htmlFor="rp-confirm"
                  className="block text-xs font-medium text-earth-700"
                >
                  確認新密碼
                </label>
                <input
                  id="rp-confirm"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                  {error}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isPending}
                  className="flex-1 rounded-lg border border-earth-300 px-4 py-2 text-xs font-medium text-earth-600 hover:bg-earth-50 disabled:opacity-60"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                >
                  {isPending ? "更新中..." : "確認重設"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
