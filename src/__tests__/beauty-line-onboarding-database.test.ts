import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LineIdentityReviewError } from "@/server/services/line-identity-review";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), resolve: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/services/verified-line-customer", () => ({ resolveVerifiedLineCustomer: mocks.resolve }));
import { canOnboardVerifiedBeautyMember, onboardVerifiedBeautyMember } from "@/server/services/beauty-line-onboarding";

let db: PGlite;
let failOnLink: boolean;
const subject = "U" + "b".repeat(32);
const config = { storeId: "s", slug: "beauty", identityMode: "CENTRAL", providerId: "901", loginChannelId: "902", messagingProviderId: "901", messagingChannelId: "903", liffId: "902-beauty", basicId: "@beauty", destination: "U" + "a".repeat(32), accessTokenEnv: "TEST_TOKEN", channelSecretEnv: "TEST_SECRET" };
const input = { storeId: "s", lineUserId: subject, identityProvider: "line", name: "新會員", phone: "0912345678", lineName: "LINE name" };
const compile = (s: TemplateStringsArray) => s.reduce((r, p, i) => r + (i ? `$${i}` : "") + p, "");
const tx = {
  $queryRaw: async (s: TemplateStringsArray, ...v: unknown[]) => (await db.query(compile(s), v)).rows,
  $executeRaw: async (s: TemplateStringsArray, ...v: unknown[]) => {
    if (failOnLink && compile(s).includes('INSERT INTO "CustomerIdentityLink"')) throw Error("simulated final write failure");
    return (await db.query(compile(s), v)).affectedRows ?? 0;
  },
};
const rows = async (table: string) => (await db.query<Record<string, unknown>>(`SELECT * FROM "${table}" ORDER BY id`)).rows;
async function account(role = "CUSTOMER", status = "ACTIVE") {
  await db.query('INSERT INTO "User" (id,name,phone,role,status) VALUES ($1,$2,$3,$4,$5)', ["u", "原帳號", "0988000000", role, status]);
  await db.query('INSERT INTO "Account" VALUES ($1,$2,$3,$4,$5)', ["a", "u", "oauth", "line", subject]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE "Store" (id text PRIMARY KEY,slug text,"industryModule" text,"operatingStatus" text,"liffId" text);
    CREATE TABLE "User" (id text PRIMARY KEY,name text,phone text UNIQUE,role text,status text,"createdAt" timestamptz,"updatedAt" timestamptz);
    CREATE TABLE "Account" (id text PRIMARY KEY,"userId" text REFERENCES "User",type text,provider text,"providerAccountId" text,UNIQUE(provider,"providerAccountId"));
    CREATE TABLE "Customer" (id text PRIMARY KEY,"storeId" text REFERENCES "Store","userId" text UNIQUE,name text,phone text,"authSource" text,"customerStage" text,"selfBookingEnabled" boolean,"lineUserId" text,"lineName" text,"lineLinkStatus" text,"lineLinkedAt" timestamptz,"mergedIntoCustomerId" text,"createdAt" timestamptz,"updatedAt" timestamptz,UNIQUE("storeId",phone),UNIQUE("storeId","lineUserId"));
    CREATE TABLE "CustomerIdentityLink" (id text PRIMARY KEY,"userId" text REFERENCES "User","storeId" text REFERENCES "Store","customerId" text REFERENCES "Customer",provider text,"providerAccountId" text,"lineUserId" text,"createdAt" timestamptz,"updatedAt" timestamptz,UNIQUE(provider,"providerAccountId","storeId"),UNIQUE("customerId",provider),UNIQUE("userId","storeId",provider));
    CREATE TABLE "CentralMemberLinkReviewRequest" (id text PRIMARY KEY,"userId" text,"storeId" text,type text,status text);
  `);
});
afterAll(async () => db.close());
afterEach(() => vi.unstubAllEnvs());
beforeEach(async () => {
  vi.resetAllMocks();
  failOnLink = false;
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([config]));
  vi.stubEnv("STORE_LINE_ADDITIONAL_CONFIG_JSON", "");
  vi.stubEnv("CENTRAL_LINE_PROVIDER_ID", "901");
  await db.exec('TRUNCATE "CustomerIdentityLink","Account","User","Customer","Store","CentralMemberLinkReviewRequest" CASCADE');
  await db.exec(`INSERT INTO "Store" VALUES ('s','beauty','BEAUTY','TRIAL','902-beauty'),('other','other','BEAUTY','ACTIVE',NULL)`);
  mocks.resolve.mockResolvedValue(null);
  mocks.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => {
    await db.exec("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try { const result = await work(tx); await db.exec("COMMIT"); return result; }
    catch (error) { await db.exec("ROLLBACK"); throw error; }
  });
});

describe("Beauty first LINE registration", () => {
  it("offers a form without writing any membership or granting a session", async () => {
    await account();
    expect(await canOnboardVerifiedBeautyMember(input)).toBe(true);
    expect(await rows("Customer")).toEqual([]);
    expect(await rows("CustomerIdentityLink")).toEqual([]);
  });
  it("atomically creates a new store member with no global phone claim or self-booking rights", async () => {
    expect(await onboardVerifiedBeautyMember(input)).toEqual({ status: "ok" });
    const users = await rows("User");
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ phone: null, role: "CUSTOMER", status: "ACTIVE" });
    const customers = await rows("Customer");
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({ storeId: "s", userId: null, name: input.name, phone: input.phone, lineUserId: subject, lineLinkStatus: "LINKED", customerStage: "LEAD", selfBookingEnabled: false });
    expect(await rows("CustomerIdentityLink")).toEqual([expect.objectContaining({ storeId: "s", customerId: customers[0].id, userId: users[0].id, provider: "line", providerAccountId: subject })]);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });
  it.each(["CUSTOMER", "OWNER", "STAFF"])("reuses an active %s account only in member context, preserving its role/profile and other store", async role => {
    await account(role);
    await db.exec(`INSERT INTO "Customer" (id,"storeId","userId",name,phone) VALUES ('other-c','other','u','原會員','0912345678')`);
    const oldUsers = await rows("User"); const oldAccounts = await rows("Account");
    const oldCustomer = (await rows("Customer"))[0];
    mocks.resolve.mockRejectedValue(new LineIdentityReviewError("store_membership_unconfirmed"));
    expect(await onboardVerifiedBeautyMember(input)).toEqual({ status: "ok" });
    expect(await rows("User")).toEqual(oldUsers);
    expect(await rows("Account")).toEqual(oldAccounts);
    expect((await rows("Customer")).find(c => c.id === "other-c")).toEqual(oldCustomer);
    expect(await rows("CustomerIdentityLink")).toEqual([expect.objectContaining({ userId: "u", storeId: "s" })]);
  });
  it("does not claim a different global user's matching phone", async () => {
    await db.query('INSERT INTO "User" (id,phone,role,status) VALUES ($1,$2,$3,$4)', ["other", input.phone, "CUSTOMER", "ACTIVE"]);
    expect(await onboardVerifiedBeautyMember(input)).toEqual({ status: "ok" });
    expect((await rows("User")).find(u => u.id === "other")).toMatchObject({ phone: input.phone });
    expect((await rows("CustomerIdentityLink"))[0].userId).not.toBe("other");
  });
  it.each(["phone", "subject", "user", "merged"])("refuses existing same-store %s data without overwriting or creating identities", async kind => {
    await account();
    await db.query('INSERT INTO "Customer" (id,"storeId",name,phone,"lineUserId","userId","mergedIntoCustomerId") VALUES ($1,$2,$3,$4,$5,$6,$7)',
      ["existing", "s", "原會員", kind === "phone" || kind === "merged" ? input.phone : "0999000000", kind === "subject" ? subject : null, kind === "user" ? "u" : null, kind === "merged" ? "target" : null]);
    const before = await rows("Customer");
    expect(await onboardVerifiedBeautyMember(input)).toEqual({ status: "identity_review_required" });
    expect(await rows("Customer")).toEqual(before);
    expect(await rows("CustomerIdentityLink")).toEqual([]);
    expect(await rows("User")).toHaveLength(1);
  });
  it("retains a cross-provider same-store membership for staff review", async () => {
    await account();
    await db.exec(`INSERT INTO "Customer" (id,"storeId",name,phone) VALUES ('existing','s','原會員','0999000000');
      INSERT INTO "CustomerIdentityLink" (id,"userId","storeId","customerId",provider,"providerAccountId") VALUES ('l','u','s','existing','google','g')`);
    expect(await canOnboardVerifiedBeautyMember(input)).toBe(false);
    expect(await onboardVerifiedBeautyMember(input)).toEqual({ status: "identity_review_required" });
    expect(await rows("Customer")).toHaveLength(1);
  });
  it.each(["PENDING", "APPROVED"])("does not bypass a %s unlink request", async status => {
    await account();
    await db.query('INSERT INTO "CentralMemberLinkReviewRequest" VALUES ($1,$2,$3,$4,$5)', ["r", "u", "s", "UNLINK_REQUEST", status]);
    expect(await canOnboardVerifiedBeautyMember(input)).toBe(false);
    expect(await onboardVerifiedBeautyMember(input)).toEqual({ status: "identity_review_required" });
    expect(await rows("Customer")).toEqual([]);
  });
  it("blocks disabled accounts", async () => {
    await account("CUSTOMER", "SUSPENDED");
    expect(await canOnboardVerifiedBeautyMember(input)).toBe(false);
    expect(await onboardVerifiedBeautyMember(input)).toEqual({ status: "identity_review_required" });
    expect(await rows("Customer")).toEqual([]);
  });
  it.each(["status", "module", "liff", "missing-config", "provider"])("rechecks %s on direct form submission", async kind => {
    if (kind === "status") await db.exec(`UPDATE "Store" SET "operatingStatus"='PAUSED' WHERE id='s'`);
    if (kind === "module") await db.exec(`UPDATE "Store" SET "industryModule"='COURSE' WHERE id='s'`);
    if (kind === "liff") await db.exec(`UPDATE "Store" SET "liffId"='902-other' WHERE id='s'`);
    if (kind === "missing-config") vi.stubEnv("STORE_LINE_CONFIG_JSON", "");
    const request = { ...input, identityProvider: kind === "provider" ? "wrong-provider" : "line" };
    expect(await canOnboardVerifiedBeautyMember(request)).toBe(false);
    expect(await onboardVerifiedBeautyMember(request)).toEqual({ status: "identity_review_required" });
    expect(await rows("User")).toEqual([]);
    expect(await rows("Customer")).toEqual([]);
  });
  it("rechecks a phone collision that appears after the form was offered", async () => {
    expect(await canOnboardVerifiedBeautyMember(input)).toBe(true);
    await db.query('INSERT INTO "Customer" (id,"storeId",name,phone) VALUES ($1,$2,$3,$4)', ["c", "s", "既有", input.phone]);
    expect(await onboardVerifiedBeautyMember(input)).toEqual({ status: "identity_review_required" });
    expect(await rows("User")).toEqual([]);
    expect(await rows("Customer")).toHaveLength(1);
  });
  it("rolls back all identity rows when the final link insert fails", async () => {
    failOnLink = true;
    expect(await onboardVerifiedBeautyMember(input)).toEqual({ status: "service_unavailable" });
    for (const table of ["User", "Account", "Customer", "CustomerIdentityLink"]) expect(await rows(table)).toEqual([]);
  });
  it("returns an existing verified member without mutating their name/phone or duplicating registration", async () => {
    mocks.resolve.mockResolvedValue({ id: "already-verified", userId: "u" });
    expect(await onboardVerifiedBeautyMember(input)).toEqual({ status: "ok" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("keeps actual resolver conflicts in review and outages retryable", async () => {
    mocks.resolve.mockRejectedValueOnce(new LineIdentityReviewError("account_owner_conflict"));
    expect(await onboardVerifiedBeautyMember(input)).toEqual({ status: "identity_review_required" });
    mocks.resolve.mockRejectedValueOnce(Error("database unavailable"));
    expect(await onboardVerifiedBeautyMember(input)).toEqual({ status: "service_unavailable" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("normalizes contact phones and rejects invalid phones without writes", async () => {
    expect(await onboardVerifiedBeautyMember({ ...input, phone: "bad" })).toEqual({ status: "invalid_phone" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(await onboardVerifiedBeautyMember({ ...input, phone: "+886912-345-678" })).toEqual({ status: "ok" });
    expect((await rows("Customer"))[0].phone).toBe(input.phone);
  });
  it("isolates an independent Provider from legacy central LINE identities", async () => {
    vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([{ ...config, identityMode: "PROVIDER" }]));
    await account();
    expect(await onboardVerifiedBeautyMember({ ...input, identityProvider: "line-provider:901" })).toEqual({ status: "ok" });
    const links = await rows("CustomerIdentityLink");
    expect(links).toEqual([expect.objectContaining({ provider: "line-provider:901" })]);
    expect(links[0].userId).not.toBe("u");
    expect((await rows("Customer"))[0].lineUserId).toBeNull();
  });
});
