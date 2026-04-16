"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  staffChangePasswordAction,
  type ChangePasswordState,
} from "@/server/actions/profile";

const initial: ChangePasswordState = { error: null, success: false };

export default function ChangePasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    staffChangePasswordAction,
    initial,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Success → toast + close
  useEffect(() => {
    if (state.success) {
      toast.success("密碼已更新");
      formRef.current?.reset();
      onClose();
    }
  }, [state.success, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-earth-900/30 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-xl border border-earth-200 bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-base font-bold text-earth-900">修改密碼</h2>

        <form ref={formRef} action={formAction} className="space-y-3">
          <div>
            <label
              htmlFor="cp-current"
              className="block text-xs font-medium text-earth-700"
            >
              目前密碼
            </label>
            <input
              id="cp-current"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label
              htmlFor="cp-new"
              className="block text-xs font-medium text-earth-700"
            >
              新密碼
            </label>
            <input
              id="cp-new"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <p className="mt-1 text-[10px] text-earth-400">至少 8 碼</p>
          </div>

          <div>
            <label
              htmlFor="cp-confirm"
              className="block text-xs font-medium text-earth-700"
            >
              確認新密碼
            </label>
            <input
              id="cp-confirm"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {state.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {state.error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-earth-300 px-4 py-2 text-xs font-medium text-earth-600 hover:bg-earth-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {pending ? "更新中..." : "確認修改"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
