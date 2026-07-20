import { AppError } from "@/lib/errors";
import { missingRequiredFields } from "@/lib/customer-completion";
import { prisma } from "@/lib/db";
import { getCanonicalCustomerIdForSession } from "@/lib/customer-identity";

export interface CustomerBookingSession {
  id: string;
  customerId?: string | null;
  email?: string | null;
  storeId?: string | null;
}

export type CustomerBookingEligibility =
  | { status: "ok"; customerId: string; storeId: string }
  | { status: "no_customer" }
  | { status: "profile_incomplete" };

/**
 * Server-side completion policy for customer booking mutations. A valid phone
 * here means filled and format-valid only; it is not ownership verification.
 */
export async function getCustomerBookingEligibility(
  user: CustomerBookingSession,
): Promise<CustomerBookingEligibility> {
  const customerId = await getCanonicalCustomerIdForSession(user);
  if (!customerId) return { status: "no_customer" };

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, storeId: true, name: true, phone: true },
  });
  if (!customer) return { status: "no_customer" };
  if (user.storeId && customer.storeId !== user.storeId) {
    return { status: "no_customer" };
  }
  if (missingRequiredFields(customer).length > 0) {
    return { status: "profile_incomplete" };
  }

  return { status: "ok", customerId: customer.id, storeId: customer.storeId };
}

export async function requireCustomerBookingEligibility(
  user: CustomerBookingSession,
): Promise<{ customerId: string; storeId: string }> {
  const eligibility = await getCustomerBookingEligibility(user);
  if (eligibility.status === "ok") return eligibility;
  if (eligibility.status === "profile_incomplete") {
    throw new AppError(
      "FORBIDDEN",
      "請先完成姓名與有效手機號碼，才能預約、改約或取消預約",
    );
  }
  throw new AppError("UNAUTHORIZED", "找不到您的顧客資料，請重新登入後再試");
}
