"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { updateProfileAction, type ProfileState } from "@/server/actions/profile";
import { useOneShotActionState } from "@/hooks/use-one-shot-action-state";
import { useStoreSlugRequired } from "@/lib/store-context";
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
  const storeSlug = useStoreSlugRequired();
  const prefix = `/s/${storeSlug}`;
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    updateProfileAction,
    { error: null, success: false }
  );

  useOneShotActionState<ProfileState>({
    state,
    successToastId: "profile-save-success",
    errorToastId: "profile-save-error",
    successMessage: onboardingMode ? "完成註冊，開始使用吧！" : "個人資料已儲存",
    onSuccess: async () => {
      // 完整 session 同步流程（雙保險，防 client / server 不一致）：
      //   1. await updateSession() — 觸發 NextAuth jwt callback trigger='update'，
      //      重讀 DB 並把新的 customerId / storeId / role 寫回 cookie
      //   2. router.refresh() — 強制 server components 用新 cookie 重新 render
      //   3. 若有 dest（onboarding 或 next 參數）— 用 full navigation 進目的頁，
      //      確保 layout completion gate 拿到最新 cookie，不會誤把人彈回 /profile
      try {
        await updateSession();
      } catch (err) {
        console.warn("[profile-form] session update failed", err);
      }
      router.refresh();

      const dest = nextPath || (onboardingMode ? "/book" : null);
      if (dest) {
        setTimeout(() => {
          window.location.assign(dest);
        }, 500);
      }
    },
  });

  const inputCls =
    "w-full rounded-xl border border-earth-300 px-4 text-base text-earth-900 h-12 placeholder:text-earth-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500";
  const labelCls = "mb-2 block text-base font-medium text-earth-800";
  const hintCls = "mt-2 text-sm text-earth-700";

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base font-medium text-red-700">{state.error}</div>
      )}
      {state.success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-base font-medium text-green-700">資料已更新</div>
      )}

      <div>
        <label htmlFor="name" className={labelCls}>姓名</label>
        <input
          id="name" name="name" type="text" required
          defaultValue={customer.name}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="phone" className={labelCls}>
          聯絡電話 <span className="text-red-600">*</span>
        </label>
        <input
          id="phone" name="phone" type="tel" required
          inputMode="numeric"
          pattern="09[0-9]{8}"
          maxLength={10}
          defaultValue={customer.phone}
          className={inputCls}
        />
        <p className={hintCls}>09 開頭共 10 碼，無需輸入空格或連字號</p>
      </div>

      <div>
        <label htmlFor="email" className={labelCls}>
          Email <span className="text-red-600">*</span>
        </label>
        <input
          id="email" name="email" type="email" required
          defaultValue={customer.email ?? ""}
          placeholder="example@email.com"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="birthday" className={labelCls}>
            生日 <span className="text-red-600">*</span>
          </label>
          <input
            id="birthday" name="birthday" type="date" required
            defaultValue={customer.birthday ?? ""}
            className={inputCls}
          />
          {age !== null && (
            <p className={hintCls}>{age} 歲</p>
          )}
        </div>

        <div>
          <label htmlFor="gender" className={labelCls}>
            性別 <span className="text-red-600">*</span>
          </label>
          <select
            id="gender" name="gender" required
            defaultValue={customer.gender ?? ""}
            className={inputCls}
          >
            <option value="" disabled>請選擇</option>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="other">其他</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="height" className={labelCls}>
          身高（cm）<span className="text-red-600">*</span>
        </label>
        <input
          id="height" name="height" type="number" min="50" max="250" step="0.1" required
          defaultValue={customer.height ?? ""}
          placeholder="例:165"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="address" className={labelCls}>
          地址 <span className="text-red-600">*</span>
        </label>
        <input
          id="address" name="address" type="text" required
          defaultValue={customer.address ?? ""}
          placeholder="請輸入地址"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="notes" className={labelCls}>備註（選填）</label>
        <textarea
          id="notes" name="notes" rows={3}
          defaultValue={customer.notes ?? ""}
          placeholder="個人備註（若資料有缺請忽略必填，可先提交其他欄位）"
          className="w-full rounded-xl border border-earth-300 px-4 py-3 text-base text-earth-900 placeholder:text-earth-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* onboarding 模式帶上 next，server action 無需讀，但保留給表單顯示/未來擴充 */}
      {nextPath && <input type="hidden" name="next" value={nextPath} />}

      <div className="flex gap-3 pt-2">
        <button
          type="submit" disabled={pending}
          className="flex-1 rounded-xl bg-primary-600 min-h-[52px] px-4 text-base font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {pending ? "儲存中..." : onboardingMode ? "完成註冊並開始使用" : "儲存變更"}
        </button>
        {/* onboarding 模式下不顯示取消，避免顧客繞過補件 */}
        {!onboardingMode && (
          <Link
            href={`${prefix}/book`}
            className="flex min-h-[52px] items-center justify-center rounded-xl border border-earth-300 px-5 text-base text-earth-800 hover:bg-earth-50"
          >
            取消
          </Link>
        )}
      </div>
    </form>
  );
}
