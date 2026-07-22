import { prisma } from "@/lib/db";

export interface CustomerLoginMethods {
  phone: { linked: boolean; maskedValue: string | null };
  google: { linked: boolean; maskedValue: string | null };
  line: { linked: boolean };
}

function maskPhone(phone: string | null): string | null {
  if (!phone || !/^09\d{8}$/.test(phone)) return null;
  return `${phone.slice(0, 2)}******${phone.slice(-2)}`;
}

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain) return null;
  return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * Read the login methods owned by the current central User.
 *
 * Callers must supply the authenticated session user id. The projection never
 * returns providerAccountId, passwordHash, OAuth tokens, or a full phone/email.
 */
export async function getCustomerLoginMethods(
  userId: string,
): Promise<CustomerLoginMethods> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      phone: true,
      email: true,
      passwordHash: true,
      accounts: {
        where: { provider: { in: ["google", "line"] } },
        select: { provider: true },
      },
    },
  });

  if (!user) {
    return {
      phone: { linked: false, maskedValue: null },
      google: { linked: false, maskedValue: null },
      line: { linked: false },
    };
  }

  const providers = new Set(user.accounts.map((account) => account.provider));
  const phoneMasked = maskPhone(user.phone);

  return {
    phone: {
      // A contact phone alone is not a login method. Both the normalized
      // central phone and a password are required by customer-phone auth.
      linked: Boolean(phoneMasked && user.passwordHash),
      maskedValue: phoneMasked,
    },
    google: {
      linked: providers.has("google"),
      maskedValue: providers.has("google") ? maskEmail(user.email) : null,
    },
    line: { linked: providers.has("line") },
  };
}
