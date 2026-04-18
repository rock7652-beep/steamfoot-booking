import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ProfileForm } from "./profile-form";
import { ChangePasswordForm } from "./change-password-form";

/**
 * 我的資料
 *
 * Hardening:
 *   - 不做 role 檢查（由 (customer)/layout.tsx 處理）
 *   - 不對 !customer 做 redirect("/")（會因 proxy 把 CUSTOMER 導回 /book → 看起來像「跳回首頁」）
 *   - 找不到 Customer 時顯示提示並提供空表單，讓顧客仍可看到基本資料頁
 */
export default async function ProfilePage() {
  const user = await getCurrentUser();

  // 若 session 沒有 customerId（stale JWT 等）— 顯示友善訊息，不 redirect
  type ProfileCustomer = {
    name: string;
    phone: string;
    email: string | null;
    gender: string | null;
    birthday: Date | null;
    height: number | null;
    address: string | null;
    notes: string | null;
  };
  let customer: ProfileCustomer | null = null;
  if (user?.customerId) {
    try {
      customer = await prisma.customer.findUnique({
        where: { id: user.customerId },
        select: {
          name: true,
          phone: true,
          email: true,
          gender: true,
          birthday: true,
          height: true,
          address: true,
          notes: true,
        },
      });
    } catch (err) {
      console.error("[profile] fetch customer failed", err);
    }
  }

  const birthdayStr = customer?.birthday
    ? customer.birthday.toISOString().slice(0, 10)
    : null;

  // 年齡計算
  let age: number | null = null;
  if (customer?.birthday) {
    const today = new Date();
    const birth = new Date(customer.birthday);
    age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
  }

  const customerForForm = customer
    ? {
        name: customer.name ?? "",
        phone: customer.phone ?? "",
        email: customer.email,
        gender: customer.gender,
        birthday: birthdayStr,
        height: customer.height,
        address: customer.address,
        notes: customer.notes,
      }
    : {
        name: user?.name ?? "",
        phone: "",
        email: null,
        gender: null,
        birthday: null,
        height: null,
        address: null,
        notes: null,
      };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/book" className="text-earth-400 hover:text-earth-600 lg:hidden">
          &larr;
        </Link>
        <h1 className="text-xl font-bold text-earth-900">我的資料</h1>
      </div>

      <div className="space-y-6">
        {/* 若找不到顧客資料，顯示提示（但仍 render form，讓顧客可補填） */}
        {!customer && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            目前找不到您的顧客資料，請補齊下列基本資料後儲存；或聯繫店家協助。
          </div>
        )}

        {/* 基本資料 */}
        <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-earth-700">基本資料</h2>
          <ProfileForm customer={customerForForm} age={age} />
        </div>

        {/* 修改密碼 */}
        <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-earth-700">修改密碼</h2>
          <ChangePasswordForm />
        </div>

        {/* 帳號安全提醒 */}
        <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-earth-700">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary-600"
            >
              <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            帳號安全提醒
          </h2>
          <ul className="space-y-2 text-sm leading-relaxed text-earth-600">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-earth-400" />
              <span>建議定期更換密碼，並使用不易被猜到的組合。</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-earth-400" />
              <span>請勿將帳號密碼分享給他人，包含店家工作人員。</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-earth-400" />
              <span>若發現異常登入，請立即更換密碼並聯繫店家。</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
