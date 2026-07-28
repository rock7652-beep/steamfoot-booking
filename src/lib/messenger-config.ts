import { prisma } from "@/lib/db";

export const MESSENGER_CONFIG_NOT_FOUND = "Messenger page configuration not found";

function envSlug(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
}

function nonEmptyEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

export function getMessengerVerifyToken(): string | null {
  return nonEmptyEnv("MESSENGER_VERIFY_TOKEN");
}

export function getMessengerAppSecret(): string | null {
  return nonEmptyEnv("MESSENGER_APP_SECRET");
}

export function getMessengerPageConfig(storeSlug: string): {
  pageId: string | null;
  accessToken: string | null;
} {
  const suffix = envSlug(storeSlug);
  return {
    pageId: nonEmptyEnv(`MESSENGER_PAGE_ID_${suffix}`),
    accessToken: nonEmptyEnv(`MESSENGER_PAGE_ACCESS_TOKEN_${suffix}`),
  };
}

export async function resolveMessengerStoreByPageId(pageId: string): Promise<{
  id: string;
  slug: string;
  accessToken: string;
} | null> {
  const stores = await prisma.store.findMany({
    where: {
      isDemo: false,
      operatingStatus: { in: ["ACTIVE", "TRIAL"] },
    },
    select: { id: true, slug: true },
  });

  for (const store of stores) {
    const config = getMessengerPageConfig(store.slug);
    if (config.pageId === pageId && config.accessToken) {
      return { id: store.id, slug: store.slug, accessToken: config.accessToken };
    }
  }

  return null;
}
