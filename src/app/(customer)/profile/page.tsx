import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ProfileForm } from "./profile-form";
import { ChangePasswordForm } from "./change-password-form";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "CUSTOMER" || !user.customerId) redirect("/");

  const customer = await prisma.customer.findUnique({
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
  if (!customer) redirect("/");

  const birthdayStr = customer.birthday
    ? customer.birthday.toISOString().slice(0, 10)
    : null;

  // 年齡計算
  let age: number | null = null;
  if (customer.birthday) {
    const today = new Date();
    const birth = new Date(customer.birthday);
    age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/book" className="text-earth-400 hover:text-earth-600 lg:hidden">
          &larr;
        </Link>
        <h1 className="text-xl font-bold text-earth-900">我的資料</h1>
      </div>

      <div className="space-y-6">
        {/* 基本資料 */}
        <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-earth-700">基本資料</h2>
          <ProfileForm
            customer={{
              name: customer.name,
              phone: customer.phone,
              email: customer.email,
              gender: customer.gender,
              birthday: birthdayStr,
              height: customer.height,
              address: customer.address,
              notes: customer.notes,
            }}
            age={age}
          />
        </div>

        {/* 修改密碼 */}
        <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-earth-700">修改密碼</h2>
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
