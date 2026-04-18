"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { updateProfileAction, type ProfileState } from "@/server/actions/profile";
import { toast } from "sonner";
import Link from "next/link";

interface Props {
  customer: {
    name: string;
    phone: string;
    email: string | null;
    gender: string | null;
    birthday: string | null;
    height: number | null;
    address: string | null;
    notes: string | null;
  };
  age: number | null;
  onboardingMode?: boolean;
  nextPath?: string | null;
}

export function ProfileForm({ customer, age, onboardingMode = false, nextPath = null }: Props) {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    updateProfileAction,
    { error: null, success: false }
  );

  // toast 提示 + 成功後：刷新 JWT（customerId 可能剛被 auto-bind）→ 跳 next
  useEffect(() => {
    if (state.success) {
      toast.success(onboardingMode ? "完成註冊，開始使用吧！" : "個人資料已儲存");

      // 觸發 next-auth session update → jwt callback trigger='update' 重讀 DB，
      // 刷新 session 裡的 customerId / storeId（避免 stale JWT 造成誤導）。
      const run = async () => {
        try {
          await updateSession();
        } catch (err) {
          console.warn("[profile-form] session update failed", err);
        }
        const dest = nextPath || (onboardingMode ? "/book" : null);
        if (dest) {
          // 稍微延遲讓 toast 有時間顯示
          setTimeout(() => {
            router.push(dest);
            router.refresh();
          }, 600);
        } else {
          router.refresh();
        }
      };
      void run();
    }
    if (state.error) toast.error(state.error);
  }, [state.success, state.error, onboardingMode, nextPath, router, updateSession]);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{state.error}</div>
      )}
      {state.success && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-600">資料已更新</div>
      )}

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-earth-700">姓名</label>
        <input
          id="name" name="name" type="text" required
          defaultValue={customer.name}
          className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div>
        <label htmlFor="phone" className="mb-1 block text-sm font-medium text-earth-700">
          聯絡電話 <span className="text-red-500">*</span>
        </label>
        <input
          id="phone" name="phone" type="tel" required
          defaultValue={customer.phone}
          className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <p className="mt-1 text-xs text-earth-400">用於預約聯繫使用</p>
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-earth-700">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          id="email" name="email" type="email" required
          defaultValue={customer.email ?? ""}
          placeholder="example@email.com"
          className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 placeholder:text-earth-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="birthday" className="mb-1 block text-sm font-medium text-earth-700">
            生日 <span className="text-red-500">*</span>
          </label>
          <input
            id="birthday" name="birthday" type="date" required
            defaultValue={customer.birthday ?? ""}
            className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          {age !== null && (
            <p className="mt-1 text-xs text-earth-400">{age} 歲</p>
          )}
        </div>

        <div>
          <label htmlFor="gender" className="mb-1 block text-sm font-medium text-earth-700">
            性別 <span className="text-red-500">*</span>
          </label>
          <select
            id="gender" name="gender" required
            defaultValue={customer.gender ?? ""}
            className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="" disabled>請選擇</option>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="other">其他</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="height" className="mb-1 block text-sm font-medium text-earth-700">
          身高（cm）<span className="text-red-500">*</span>
        </label>
        <input
          id="height" name="height" type="number" min="50" max="250" step="0.1" required
          defaultValue={customer.height ?? ""}
          placeholder="例：165"
          className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 placeholder:text-earth-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div>
        <label htmlFor="address" className="mb-1 block text-sm font-medium text-earth-700">
          地址 <span className="text-red-500">*</span>
        </label>
        <input
          id="address" name="address" type="text" required
          defaultValue={customer.address ?? ""}
          placeholder="請輸入地址"
          className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 placeholder:text-earth-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div>
        <label htmlFor="notes" className="mb-1 block text-sm font-medium text-earth-700">備註（選填）</label>
        <textarea
          id="notes" name="notes" rows={2}
          defaultValue={customer.notes ?? ""}
          placeholder="個人備註（若資料有缺請忽略必填，可先提交其他欄位）"
          className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 placeholder:text-earth-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      {/* onboarding 模式帶上 next，server action 無需讀，但保留給表單顯示/未來擴充 */}
      {nextPath && <input type="hidden" name="next" value={nextPath} />}

      <div className="flex gap-3">
        <button
          type="submit" disabled={pending}
          className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {pending ? "儲存中..." : onboardingMode ? "完成註冊並開始使用" : "儲存變更"}
        </button>
        {/* onboarding 模式下不顯示取消，避免顧客繞過補件 */}
        {!onboardingMode && (
          <Link
            href="/book"
            className="flex items-center justify-center rounded-lg border border-earth-300 px-4 py-2.5 text-sm text-earth-600 hover:bg-earth-50"
          >
            取消
          </Link>
        )}
      </div>
    </form>
  );
}
