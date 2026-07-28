import { getMessengerPageConfig } from "@/lib/messenger-config";

const REQUIRED_FIELDS = ["messages", "messaging_postbacks", "messaging_optins", "messaging_referrals"];

type CallResult = { ok: boolean; httpStatus: number | null; error: "http_error" | "invalid_response" | "network_error" | null };

export type MessengerProductionAuditResult = {
  appValidated: boolean;
  pageTokenMatches: boolean;
  callbackMatches: boolean;
  configuredFields: string[];
  missingFields: string[];
  pageAttached: boolean;
  calls: Record<"app" | "page" | "pageTokenIdentity" | "webhookSubscription" | "subscribedApps", CallResult>;
};

type Config = {
  appId: string;
  appAccessToken: string;
  pageId: string;
  pageAccessToken: string;
  webhookUrl: string;
  graphApiVersion: string;
};

export function missingMessengerProductionAuditConfig(storeSlug: string): string[] {
  const page = getMessengerPageConfig(storeSlug);
  const required: Array<[string, string | null | undefined]> = [
    ["MESSENGER_APP_ID", process.env.MESSENGER_APP_ID?.trim()],
    ["MESSENGER_APP_ACCESS_TOKEN", process.env.MESSENGER_APP_ACCESS_TOKEN?.trim()],
    [`MESSENGER_PAGE_ID_${storeSlug.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`, page.pageId],
    [`MESSENGER_PAGE_ACCESS_TOKEN_${storeSlug.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`, page.accessToken],
    ["MESSENGER_WEBHOOK_URL", process.env.MESSENGER_WEBHOOK_URL?.trim()],
  ];
  return required.filter(([, value]) => !value).map(([name]) => name);
}

function getConfig(storeSlug: string): Config {
  const page = getMessengerPageConfig(storeSlug);
  const missing = missingMessengerProductionAuditConfig(storeSlug);
  if (missing.length > 0 || !page.pageId || !page.accessToken) {
    throw new Error("Messenger production audit configuration is incomplete");
  }
  return {
    appId: process.env.MESSENGER_APP_ID!.trim(),
    appAccessToken: process.env.MESSENGER_APP_ACCESS_TOKEN!.trim(),
    pageId: page.pageId,
    pageAccessToken: page.accessToken,
    webhookUrl: process.env.MESSENGER_WEBHOOK_URL!.trim(),
    graphApiVersion: process.env.MESSENGER_GRAPH_API_VERSION?.trim() || "v23.0",
  };
}

function emptyCall(error: CallResult["error"]): CallResult {
  return { ok: false, httpStatus: null, error };
}

async function graphJson(path: string, accessToken: string, version: string): Promise<{ call: CallResult; data: unknown }> {
  try {
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(version)}${path}${separator}access_token=${encodeURIComponent(accessToken)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return { call: { ok: false, httpStatus: response.status, error: "http_error" }, data: null };
    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object") return { call: { ok: false, httpStatus: response.status, error: "invalid_response" }, data: null };
    return { call: { ok: true, httpStatus: response.status, error: null }, data };
  } catch {
    return { call: emptyCall("network_error"), data: null };
  }
}

function objectData(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function dataItems(value: unknown): Record<string, unknown>[] {
  const object = objectData(value);
  return Array.isArray(object?.data) ? object.data.filter((item): item is Record<string, unknown> => Boolean(objectData(item))) : [];
}

/** Reads Meta control-plane state only; credentials and raw Graph bodies never leave this module. */
export async function runMessengerProductionAudit(storeSlug: string): Promise<MessengerProductionAuditResult> {
  const config = getConfig(storeSlug);
  const [app, page, pageTokenIdentity, subscriptions, subscribedApps] = await Promise.all([
    graphJson(`/${encodeURIComponent(config.appId)}?fields=id`, config.appAccessToken, config.graphApiVersion),
    graphJson(`/${encodeURIComponent(config.pageId)}?fields=id`, config.pageAccessToken, config.graphApiVersion),
    graphJson("/me?fields=id", config.pageAccessToken, config.graphApiVersion),
    graphJson(`/${encodeURIComponent(config.appId)}/subscriptions?fields=object,callback_url,fields`, config.appAccessToken, config.graphApiVersion),
    graphJson(`/${encodeURIComponent(config.pageId)}/subscribed_apps?fields=id`, config.pageAccessToken, config.graphApiVersion),
  ]);

  const appData = objectData(app.data);
  const pageData = objectData(page.data);
  const identityData = objectData(pageTokenIdentity.data);
  const pageSubscription = dataItems(subscriptions.data).find((item) => item.object === "page");
  const configuredFields = Array.isArray(pageSubscription?.fields)
    ? pageSubscription.fields.filter((field): field is string => typeof field === "string")
    : [];

  return {
    appValidated: app.call.ok && appData?.id === config.appId,
    pageTokenMatches: page.call.ok && pageTokenIdentity.call.ok && pageData?.id === config.pageId && identityData?.id === config.pageId,
    callbackMatches: subscriptions.call.ok && pageSubscription?.callback_url === config.webhookUrl,
    configuredFields,
    missingFields: REQUIRED_FIELDS.filter((field) => !configuredFields.includes(field)),
    pageAttached: subscribedApps.call.ok && dataItems(subscribedApps.data).some((item) => item.id === config.appId),
    calls: {
      app: app.call,
      page: page.call,
      pageTokenIdentity: pageTokenIdentity.call,
      webhookSubscription: subscriptions.call,
      subscribedApps: subscribedApps.call,
    },
  };
}

