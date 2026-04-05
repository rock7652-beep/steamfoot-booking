import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "CUSTOMER") redirect("/login");
  if (!user.customerId) redirect("/login");

  const customer = await prisma.customer.findUnique({
    where: { id: user.customerId },
    select: { name: true, email: true, phone: true },
  });

  if (!customer) redirect("/login");

  // 若資料已完整，直接導向預約頁
  if (customer.phone && customer.email) {
    redirect("/book");
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-2xl">
          👋
        </div>
        <h1 className="text-xl font-bold text-earth-900">歡迎加入蒸足健康站</h1>
        <p className="mt-2 text-sm text-earth-500">
          請先完善您的基本資料，以便我們為您提供更好的服務
        </p>
      </div>

      <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
        <OnboardingForm
          defaultName={customer.name || ""}
          defaultEmail={customer.email || ""}
        />
      </div>
    </div>
  );
}
