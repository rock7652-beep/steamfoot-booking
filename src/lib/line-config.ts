export const LINE_TOKEN_NOT_CONFIGURED_ERROR = "LINE token not configured for store";
export const LINE_SECRET_NOT_CONFIGURED_ERROR = "LINE secret not configured for store";

type LineStoreSlug = "zhubei" | "hsinchu" | "taichung";

const STORE_ID_TO_LINE_SLUG: Record<string, LineStoreSlug> = {
  zhubei: "zhubei",
  "store-zhubei": "zhubei",
  "e182e256-98ca-4c78-970b-d4b118066c51": "zhubei",
  hsinchu: "hsinchu",
  "store-hsinchu": "hsinchu",
  taichung: "taichung",
  "store-taichung": "taichung",
};

const LINE_ENV_BY_STORE: Record<
  LineStoreSlug,
  { accessToken: string; channelSecret: string } | null
> = {
  zhubei: {
    accessToken: "LINE_CHANNEL_ACCESS_TOKEN",
    channelSecret: "LINE_CHANNEL_SECRET",
  },
  hsinchu: {
    accessToken: "LINE_HSINCHU_CHANNEL_ACCESS_TOKEN",
    channelSecret: "LINE_HSINCHU_CHANNEL_SECRET",
  },
  taichung: {
    accessToken: "LINE_TAICHUNG_CHANNEL_ACCESS_TOKEN",
    channelSecret: "LINE_TAICHUNG_CHANNEL_SECRET",
  },
};

function nonEmptyEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function resolveLineStoreSlug(storeIdOrSlug: string): LineStoreSlug | null {
  return STORE_ID_TO_LINE_SLUG[storeIdOrSlug] ?? null;
}

export function getLineAccessTokenForStore(storeIdOrSlug: string): string | null {
  const slug = resolveLineStoreSlug(storeIdOrSlug);
  if (!slug) return null;
  const envNames = LINE_ENV_BY_STORE[slug];
  if (!envNames) return null;
  return nonEmptyEnv(envNames.accessToken);
}

export function getLineSecretForStore(storeIdOrSlug: string): string | null {
  const slug = resolveLineStoreSlug(storeIdOrSlug);
  if (!slug) return null;
  const envNames = LINE_ENV_BY_STORE[slug];
  if (!envNames) return null;
  return nonEmptyEnv(envNames.channelSecret);
}

export function getLineConfigForStore(storeIdOrSlug: string): {
  accessToken: string | null;
  channelSecret: string | null;
  storeSlug: LineStoreSlug | null;
} {
  const storeSlug = resolveLineStoreSlug(storeIdOrSlug);
  if (!storeSlug) {
    return { accessToken: null, channelSecret: null, storeSlug: null };
  }

  const envNames = LINE_ENV_BY_STORE[storeSlug];
  if (!envNames) {
    return { accessToken: null, channelSecret: null, storeSlug };
  }

  return {
    storeSlug,
    accessToken: nonEmptyEnv(envNames.accessToken),
    channelSecret: nonEmptyEnv(envNames.channelSecret),
  };
}

export function getLineWebhookDiagnosticsForStore(storeIdOrSlug: string): {
  storeSlug: LineStoreSlug | null;
  secretEnvName: string | null;
  hasSecret: boolean;
  secretLength: number | null;
  hasAccessToken: boolean;
} {
  const storeSlug = resolveLineStoreSlug(storeIdOrSlug);
  if (!storeSlug) {
    return {
      storeSlug: null,
      secretEnvName: null,
      hasSecret: false,
      secretLength: null,
      hasAccessToken: false,
    };
  }

  const envNames = LINE_ENV_BY_STORE[storeSlug];
  if (!envNames) {
    return {
      storeSlug,
      secretEnvName: null,
      hasSecret: false,
      secretLength: null,
      hasAccessToken: false,
    };
  }

  const secret = nonEmptyEnv(envNames.channelSecret);
  const accessToken = nonEmptyEnv(envNames.accessToken);
  return {
    storeSlug,
    secretEnvName: envNames.channelSecret,
    hasSecret: Boolean(secret),
    secretLength: secret?.length ?? null,
    hasAccessToken: Boolean(accessToken),
  };
}

export function isLineSmokeTestEnabled(): boolean {
  if (process.env.LINE_SMOKE_TEST_ENABLED === "1") return true;
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview";
}
