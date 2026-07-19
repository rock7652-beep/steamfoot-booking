import "server-only";

import { getLineConfigForStore } from "@/lib/line-config";
import { normalizePhone } from "@/lib/normalize";
import { prisma } from "@/lib/db";
import { decryptLineRebindCandidateUserId, maskLineRebindUserId, sha256 } from "@/server/services/line-rebind";

const LINE_API = "https://api.line.me/v2/bot";
type Check = { status: "PASS" | "FAIL" | "RETRY"; code: string };
export type LineRebindDryRunResult = {
  requestId: string; storeId: string; customerId: string; requestStatus: string; expiresAt: string;
  candidateHashPrefix: string | null; candidateMaskedUserId: string | null; botBasicId: string | null;
  checks: { candidateIntegrity: Check; phoneConsistency: Check; oldBindingConsistency: Check; identityLinkConsistency: Check; customerConflict: Check; lineBot: Check; lineProfile: Check };
  overall: "READY_FOR_REBIND" | "NOT_READY" | "RETRY_REQUIRED" | "EXPIRED";
};

const pass = (code = "OK"): Check => ({ status: "PASS", code });
const fail = (code: string): Check => ({ status: "FAIL", code });
const retry = (code: string): Check => ({ status: "RETRY", code });

async function lineGet(path: string, token: string): Promise<{ status: number; json: unknown } | null> {
  try {
    const response = await fetch(`${LINE_API}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) });
    return { status: response.status, json: await response.json().catch(() => null) };
  } catch { return null; }
}

export async function runLineRebindDryRun(requestId: string): Promise<LineRebindDryRunResult> {
  const request = await prisma.lineRebindRequest.findUnique({ where: { id: requestId }, include: { candidate: true, customer: { include: { identityLinks: true } } } });
  if (!request) throw new Error("LINE_REBIND_REQUEST_NOT_FOUND");
  const base = { requestId: request.id, storeId: request.storeId, customerId: request.customerId, requestStatus: request.status, expiresAt: request.expiresAt.toISOString() };
  const expired = request.expiresAt <= new Date();
  let candidateIntegrity: Check = fail("CANDIDATE_MISSING"), candidateUserId: string | null = null;
  if (request.candidate && request.status === "CANDIDATE_CAPTURED" && request.candidate.expiresAt.getTime() === request.expiresAt.getTime() && request.candidate.ciphertext.length && request.candidate.iv.length && request.candidate.authTag.length) {
    try { candidateUserId = decryptLineRebindCandidateUserId(request.candidate); candidateIntegrity = sha256(candidateUserId) === request.candidate.userIdHash ? pass() : fail("CANDIDATE_HASH_MISMATCH"); }
    catch { candidateIntegrity = fail("CANDIDATE_DECRYPT_FAILED"); }
  } else if (request.status !== "CANDIDATE_CAPTURED") candidateIntegrity = fail("REQUEST_NOT_CAPTURED");
  const phoneConsistency = sha256(normalizePhone(request.customer.phone)) === request.phoneHash ? pass() : fail("PHONE_HASH_MISMATCH");
  const oldBindingConsistency = request.customer.lineLinkStatus === "LINKED" && !!request.customer.lineUserId && !!request.oldUserIdHash && sha256(request.customer.lineUserId) === request.oldUserIdHash ? pass() : fail("OLD_BINDING_INCONSISTENT");
  const activeLinks = request.customer.identityLinks.filter((link) => link.lineUserId === request.customer.lineUserId);
  const identityLinkConsistency = activeLinks.length === 1 ? pass() : fail("IDENTITY_LINK_INCONSISTENT");
  let customerConflict: Check = pass("NO_CONFLICT"), lineBot: Check = fail("LINE_TOKEN_NOT_CONFIGURED"), lineProfile: Check = fail("LINE_PROFILE_NOT_CHECKED"), botBasicId: string | null = null;
  if (candidateUserId && candidateIntegrity.status === "PASS") {
    const [customers, links, accounts] = await Promise.all([
      prisma.customer.findMany({ where: { storeId: request.storeId, lineUserId: candidateUserId }, select: { id: true, userId: true } }),
      prisma.customerIdentityLink.findMany({ where: { storeId: request.storeId, OR: [{ lineUserId: candidateUserId }, { provider: "line", providerAccountId: candidateUserId }] }, select: { customerId: true, userId: true } }),
      prisma.account.findMany({ where: { provider: "line", providerAccountId: candidateUserId }, select: { userId: true } }),
    ]);
    const knownUsers = new Set([request.customer.userId, ...request.customer.identityLinks.map((x) => x.userId)].filter(Boolean));
    const foreignCustomer = customers.some((customer) => customer.id !== request.customerId);
    const foreignIdentityLink = links.some((link) => link.customerId !== request.customerId || (Boolean(link.userId) && !knownUsers.has(link.userId)));
    const foreignAccount = accounts.some((account) => Boolean(account.userId) && !knownUsers.has(account.userId));
    const foreign = foreignCustomer || foreignIdentityLink || foreignAccount;
    customerConflict = foreign ? fail("CANDIDATE_USED_BY_OTHER_CUSTOMER") : pass("NO_CONFLICT");
    const { accessToken: token, expectedBasicId } = getLineConfigForStore(request.storeId);
    if (!expectedBasicId) lineBot = fail("LINE_BOT_EXPECTED_ID_MISSING");
    else if (token) {
      const bot = await lineGet("/info", token);
      if (!bot) lineBot = retry("LINE_TIMEOUT");
      else if (bot.status === 429) lineBot = retry("LINE_RATE_LIMITED");
      else if (bot.status >= 500) lineBot = retry("LINE_UPSTREAM_ERROR");
      else if (bot.status !== 200 || !bot.json || typeof bot.json !== "object" || typeof (bot.json as { basicId?: unknown }).basicId !== "string") lineBot = fail("LINE_BOT_MISMATCH");
      else { botBasicId = (bot.json as { basicId: string }).basicId; lineBot = botBasicId === expectedBasicId ? pass() : fail("LINE_BOT_MISMATCH"); if (lineBot.status === "PASS") { const profile = await lineGet(`/profile/${encodeURIComponent(candidateUserId)}`, token); lineProfile = !profile ? retry("LINE_TIMEOUT") : profile.status === 200 ? pass() : profile.status === 404 ? fail("LINE_PROFILE_NOT_FOUND") : profile.status === 429 ? retry("LINE_RATE_LIMITED") : profile.status >= 500 ? retry("LINE_UPSTREAM_ERROR") : fail("LINE_PROFILE_UNAVAILABLE"); } }
    }
  }
  const checks = { candidateIntegrity, phoneConsistency, oldBindingConsistency, identityLinkConsistency, customerConflict, lineBot, lineProfile };
  const values = Object.values(checks);
  const overall = expired ? "EXPIRED" : values.some((x) => x.status === "RETRY") ? "RETRY_REQUIRED" : values.some((x) => x.status === "FAIL") ? "NOT_READY" : "READY_FOR_REBIND";
  return { ...base, candidateHashPrefix: request.candidate?.userIdHash.slice(0, 8) ?? null, candidateMaskedUserId: candidateUserId ? maskLineRebindUserId(candidateUserId) : null, botBasicId, checks, overall };
}
