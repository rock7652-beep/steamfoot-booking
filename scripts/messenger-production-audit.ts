/*
 * Read-only by default. With --apply, it creates/updates the Page webhook
 * subscription and attaches the configured Page to this Meta app.
 *
 * Required environment variables are intentionally server-only:
 * MESSENGER_APP_ID, MESSENGER_APP_ACCESS_TOKEN, MESSENGER_VERIFY_TOKEN,
 * MESSENGER_WEBHOOK_URL, MESSENGER_PAGE_ID_<STORE>, and
 * MESSENGER_PAGE_ACCESS_TOKEN_<STORE>. Run with --store=<store slug>.
 */

const apply = process.argv.includes("--apply");
const sendSmoke = process.argv.includes("--send-smoke");
const storeSlug = process.argv.find((arg) => arg.startsWith("--store="))?.slice("--store=".length);
if (!storeSlug) throw new Error("--store=<store slug> is required");
const storeSuffix = storeSlug.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
const required = [
  "MESSENGER_APP_ID", "MESSENGER_APP_ACCESS_TOKEN", "MESSENGER_VERIFY_TOKEN",
  "MESSENGER_WEBHOOK_URL",
] as const;
const fields = ["messages", "messaging_postbacks", "messaging_optins", "messaging_referrals"];

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const config = Object.fromEntries(required.map((name) => [name, env(name)])) as Record<typeof required[number], string> & {
  pageId: string;
  pageAccessToken: string;
};
config.pageId = env(`MESSENGER_PAGE_ID_${storeSuffix}`);
config.pageAccessToken = env(`MESSENGER_PAGE_ACCESS_TOKEN_${storeSuffix}`);
const graphApiVersion = process.env.MESSENGER_GRAPH_API_VERSION?.trim() || "v23.0";
const base = `https://graph.facebook.com/${encodeURIComponent(graphApiVersion)}`;

async function graph(path: string, accessToken: string, init?: RequestInit) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${base}${path}${separator}access_token=${encodeURIComponent(accessToken)}`, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${JSON.stringify(body)}`);
  return body as Record<string, unknown>;
}

async function main() {
  const app = await graph(`/${config.MESSENGER_APP_ID}?fields=id,name`, config.MESSENGER_APP_ACCESS_TOKEN);
  const page = await graph(`/${config.pageId}?fields=id,name`, config.pageAccessToken);
  const pageTokenIdentity = await graph(`/me?fields=id,name`, config.pageAccessToken);
  const subscriptions = await graph(`/${config.MESSENGER_APP_ID}/subscriptions?fields=object,callback_url,fields`, config.MESSENGER_APP_ACCESS_TOKEN);
  const subscribedApps = await graph(`/${config.pageId}/subscribed_apps?fields=id`, config.pageAccessToken);
  const appSubscription = Array.isArray(subscriptions.data)
    ? subscriptions.data.find((item) => item && typeof item === "object" && (item as { object?: string }).object === "page") as Record<string, unknown> | undefined
    : undefined;
  const pageAttached = Array.isArray(subscribedApps.data)
    && subscribedApps.data.some((item) => item && typeof item === "object" && (item as { id?: string }).id === config.MESSENGER_APP_ID);

  const callbackMatches = appSubscription?.callback_url === config.MESSENGER_WEBHOOK_URL;
  const pageTokenMatches = pageTokenIdentity.id === config.pageId;
  const configuredFields = Array.isArray(appSubscription?.fields) ? appSubscription.fields : [];
  const missingFields = fields.filter((field) => !configuredFields.includes(field));
  console.table([{ app: app.name ?? app.id, page: page.name ?? page.id, pageToken: pageTokenMatches ? "configured" : "wrong_page", pageWebhook: callbackMatches && missingFields.length === 0 ? "configured" : "missing_or_drifted", pageAttached: pageAttached ? "configured" : "missing" }]);
  if (!apply) {
    if (!callbackMatches || missingFields.length || !pageAttached || !pageTokenMatches) process.exitCode = 2;
    if (sendSmoke) await runSendSmoke();
    return;
  }

  const form = new URLSearchParams({ object: "page", callback_url: config.MESSENGER_WEBHOOK_URL, verify_token: config.MESSENGER_VERIFY_TOKEN, fields: fields.join(",") });
  await graph(`/${config.MESSENGER_APP_ID}/subscriptions`, config.MESSENGER_APP_ACCESS_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  await graph(`/${config.pageId}/subscribed_apps`, config.pageAccessToken, { method: "POST" });
  console.log("Messenger Page webhook and Page app subscription applied. Re-run without --apply to verify.");
  if (sendSmoke) await runSendSmoke();
}

async function runSendSmoke() {
  const recipientId = process.env.MESSENGER_SMOKE_TEST_PSID?.trim();
  if (!recipientId) throw new Error("MESSENGER_SMOKE_TEST_PSID is required with --send-smoke");
  const form = new URLSearchParams({ recipient: JSON.stringify({ id: recipientId }), message: JSON.stringify({ text: "Messenger production smoke test" }) });
  await graph(`/${config.pageId}/messages`, config.pageAccessToken, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  console.log("Messenger Send API smoke test succeeded.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Messenger production audit failed");
  process.exitCode = 1;
});
