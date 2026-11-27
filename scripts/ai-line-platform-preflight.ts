import { z } from "zod";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const branch = "feat/ai-digital-butler-core";
const testStore = z.enum(["ai-preview-steamfoot", "ai-preview-beauty", "ai-preview-fitness", "ai-preview-music"]);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const metadata = z.object({ key: z.string(), type: z.string(), target: z.array(z.string()), gitBranch: z.string().nullable() }).strict();
export const aiLinePlatformInventorySchema = z.object({
  project: z.literal("prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR"), branch: z.literal(branch), database: z.literal("ttworfzgwejdeolegkxl"),
  stopped: z.boolean(), stores: z.array(z.object({ id: testStore, isDemo: z.boolean(), enabled: z.boolean(), channels: z.array(z.string()), hasLineDestination: z.boolean() }).strict()).length(4),
  envs: z.array(metadata), reservedDestinationHashes: z.array(digest),
  platformIngressVerified: z.boolean(), liveSenderImplemented: z.boolean(), messagingIdentityReadReady: z.boolean(), originalRuntimePersistenceReady: z.boolean(),
}).strict();
export const aiLinePlatformProposalSchema = z.object({
  storeId: testStore, providerId: z.string().regex(/^\d+$/), messagingChannelId: z.string().regex(/^\d+$/),
  destination: z.string().regex(/^U[a-f0-9]{32}$/), independentTestOaConfirmed: z.boolean(),
  secretEnv: z.literal("LINE_AI_TEST_CHANNEL_SECRET"), accessTokenEnv: z.literal("LINE_AI_TEST_CHANNEL_ACCESS_TOKEN"),
  testUserHashes: z.array(digest).min(1).max(2), expiresAt: z.string().datetime(), maxReplies: z.number().int().min(1).max(4),
  maxOpenaiRequests: z.literal(0), mode: z.literal("GUEST_PUBLIC_KNOWLEDGE"),
}).strict();
export type AiLinePlatformInventory = z.infer<typeof aiLinePlatformInventorySchema>;
/** Offline proposal review only: it cannot grant permission, read secrets or send messages. */
export function aiLinePlatformPreflight(inventory: unknown, proposal?: unknown, now = new Date()) {
  const facts = aiLinePlatformInventorySchema.parse(inventory);
  const blocked = new Set<string>();
  const ids = new Set(facts.stores.map(s => s.id));
  if (ids.size !== 4 || facts.stores.some(s => !s.isDemo || s.enabled) || !facts.stopped) blocked.add("SAFE_BASELINE_REQUIRED");
  if (!facts.platformIngressVerified) blocked.add("LINE_PLATFORM_INGRESS_UNVERIFIED");
  if (!facts.liveSenderImplemented) blocked.add("BLOCKED_SINK_HAS_NO_LIVE_SENDER");
  if (!facts.messagingIdentityReadReady) blocked.add("MESSAGING_IDENTITY_RLS_NOT_READY");
  if (!facts.originalRuntimePersistenceReady) blocked.add("ORIGINAL_RUNTIME_PERSISTENCE_NOT_READY");
  const effectiveLineKeys = facts.envs.filter(e => /LINE/.test(e.key) && e.target.includes("preview") && (!e.gitBranch || e.gitBranch === branch));
  const inheritedLineKeys = effectiveLineKeys.filter(e => !e.gitBranch).map(e => e.key).sort();
  let proposalValid = false;
  if (proposal === undefined) blocked.add("DEDICATED_TEST_OA_PROPOSAL_REQUIRED");
  else {
    const parsed = aiLinePlatformProposalSchema.safeParse(proposal);
    if (!parsed.success) blocked.add("TEST_OA_PROPOSAL_INVALID");
    else {
      const p = parsed.data;
      const proposalBlocks: string[] = [];
      if (!p.independentTestOaConfirmed) proposalBlocks.push("OA_INDEPENDENCE_UNCONFIRMED");
      if (facts.reservedDestinationHashes.includes(createHash("sha256").update(p.destination).digest("hex"))) proposalBlocks.push("OA_DESTINATION_ALREADY_RESERVED");
      if (new Set(p.testUserHashes).size !== p.testUserHashes.length) proposalBlocks.push("TEST_USER_ALLOWLIST_DUPLICATE");
      const lifetime = Date.parse(p.expiresAt) - now.getTime();
      if (lifetime <= 0 || lifetime > 30 * 60_000) proposalBlocks.push("TEST_WINDOW_INVALID");
      proposalValid = proposalBlocks.length === 0;
      proposalBlocks.forEach(code => blocked.add(code));
      for (const key of [p.secretEnv, p.accessTokenEnv]) {
        const entries = facts.envs.filter(e => e.key === key);
        if (!entries.some(e => e.type === "sensitive" && e.gitBranch === branch && e.target.length === 1 && e.target[0] === "preview")) blocked.add("DEDICATED_BRANCH_SECRET_MISSING");
        if (entries.some(e => e.gitBranch !== branch || e.target.length !== 1 || e.target[0] !== "preview" || e.type !== "sensitive")) blocked.add("DEDICATED_SECRET_SCOPE_UNSAFE");
      }
      const selected = facts.stores.find(s => s.id === p.storeId);
      if (!selected?.hasLineDestination) blocked.add("TEST_OA_NOT_REGISTERED");
      if (!selected?.channels.includes("LINE")) blocked.add("LINE_CHANNEL_NOT_CONFIGURED");
    }
  }
  return { kind: "OFFLINE_PREPARATION_ONLY", proposalValid, readyForLiveRun: false,
    blockedBy: [...blocked].sort(), inheritedLineKeys, requiresFreshAuthorization: true,
    effects: { connections: 0, messages: 0, credentialsCreated: 0, settingsChanged: 0 } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw new Error("INVENTORY_REQUIRED");
    const inventory = JSON.parse(readFileSync(process.argv[2], "utf8"));
    const proposal = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], "utf8")) : undefined;
    console.log(JSON.stringify(aiLinePlatformPreflight(inventory, proposal), null, 2));
    // This is an inventory report, not a live readiness check or activation command.
  } catch { console.error("AI_LINE_PLATFORM_PREFLIGHT_INPUT_INVALID"); process.exitCode = 1; }
}
