import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "CUSTOMER") redirect("/login");
  if (!user.customerId) redirect("/login");

  const customer = await prisma.customer.findUnique({
    where: { id: user.customerId },
    select: {
      name: true,
      email: true,
      phone: true,
      gender: true,
      birthday: true,
      height: true,
      avatar: true,
      customerStage: true,
      createdAt: true,
    },
  });

  if (!customer) redirect("/login");

  // 格式化 birthday 為 YYYY-MM-DD
  const birthdayStr = customer.birthday
    ? customer.birthday.toISOString().slice(0, 10)
    : null;

  const stageLabels: Record<string, string> = {
    LEAD: "新會員",
    TRIAL: "體驗中",
    ACTIVE: "活躍會員",
    INACTIVE: "待續約",
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-xl font-bold text-earth-900">我的資料</h1>

      {/* 頭像與狀態 */}
      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-earth-200 bg-white p-4 shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-primary-100">
          {customer.avatar ? (
            <img
              src={customer.avatar}
              alt="avatar"
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-2xl text-primary-600">
              {customer.name?.charAt(0) || "?"}
            </span>
          )}
        </div>
        <div>
          <p className="text-base font-semibold text-earth-900">{customer.name}</p>
          <p className="text-xs text-earth-500">
            {stageLabels[customer.customerStage] || customer.customerStage}
            {" · "}
            加入於 {customer.createdAt.toLocaleDateString("zh-TW")}
          </p>
        </div>
      </div>

      {/* 編輯表單 */}
      <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
        <ProfileForm
          customer={{
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            gender: customer.gender,
            birthday: birthdayStr,
            height: customer.height,
          }}
        />
      </div>
    </div>
  );
}
