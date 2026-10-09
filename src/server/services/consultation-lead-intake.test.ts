import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  claimConsultationDelivery,
  consultationHqEnabled,
  consultationPayloadSnapshot,
  ConsultationRequestConflictError,
  markConsultationDelivery,
  saveConsultationLead,
} from "./consultation-lead-intake";
import type { ConsultationPayload } from "@/lib/consultation-lead";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), allowed: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { consultationLead: mocks } }));
vi.mock("@/server/services/trial-application-access", () => ({ trialApplicationDatabaseAllowed: mocks.allowed }));

const payload: ConsultationPayload = {
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  storeName: "Synthetic studio",
  contactName: "Synthetic contact",
  industry: "一般店家",
  lineId: "synthetic-line",
  needs: ["預約管理"],
  replaceReason: [],
};
const duplicate = () => new Prisma.PrismaClientKnownRequestError("Synthetic conflict", { code: "P2002", clientVersion: "test" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CONSULTATION_HQ_ENABLED", "true");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("CONSULTATION_PREVIEW_INTAKE_ENABLED", "false");
  mocks.allowed.mockReturnValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe("durable original consultation intake", () => {
  it("persists all supplied public links in HQ columns and the immutable original payload", async () => {
    mocks.create.mockImplementation(async ({ data }) => ({ id: "lead-synthetic", ...data }));
    const links = {
      websiteUrl: "https://studio.example.com/about",
      facebookUrl: "https://www.facebook.com/synthetic-studio",
      instagramUrl: "https://www.instagram.com/synthetic-studio",
    };
    const result = await saveConsultationLead({ ...payload, ...links, pageUrl: "https://www.steamfoot.com/apply" });
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      ...links, originalPayload: expect.objectContaining(links),
    }) });
    expect(result.lead).toMatchObject(links);
    expect(result.lead.originalPayload).toMatchObject({ ...links, pageUrl: "https://www.steamfoot.com/apply" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("saves normalized display columns and a snapshot without any fabricated email/link", async () => {
    mocks.create.mockImplementation(async ({ data }) => ({ id: "lead-synthetic", sheetStatus: "PENDING", ...data }));
    const result = await saveConsultationLead({ ...payload, storeName: " Synthetic studio ", pageUrl: "https://intake.example.com/apply", websiteUrl: "https://studio.example.com" });
    expect(result.created).toBe(true);
    expect(result.lead).toMatchObject({ storeName: "Synthetic studio", contactName: "Synthetic contact", phone: null, lineId: "synthetic-line", websiteUrl: "https://studio.example.com", facebookUrl: null });
    expect(result.lead).not.toHaveProperty("contactEmail");
    expect(result.lead).not.toHaveProperty("trialApplicationId");
    expect(result.lead.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.lead.originalPayload).toMatchObject({ pageUrl: "https://intake.example.com/apply" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("uses a canonical parsed key order and keeps array ordering significant", () => {
    const reordered = Object.fromEntries(Object.entries(payload).reverse()) as ConsultationPayload;
    expect(consultationPayloadSnapshot(payload).payloadHash).toBe(consultationPayloadSnapshot(reordered).payloadHash);
    const multi = { ...payload, needs: ["a", "b"] };
    expect(consultationPayloadSnapshot(multi).payloadHash).not.toBe(consultationPayloadSnapshot({ ...multi, needs: ["b", "a"] }).payloadHash);
  });

  it("erases fitness no-contact data before snapshot, fingerprint, and normalized columns", async () => {
    mocks.create.mockImplementation(async ({ data }) => ({ id: "lead-synthetic", ...data }));
    const optedOut: ConsultationPayload = { ...payload, formVersion: "fitness-v2", source: "fitness-intake", contactWay: "目前暫不考慮", priorityNeed: "預約管理", phone: "synthetic-phone", time: "synthetic-time" };
    const result = await saveConsultationLead(optedOut);
    expect(result.lead).toMatchObject({ contactName: null, phone: null, lineId: null });
    expect(result.lead.originalPayload).toMatchObject({ contactName: "", phone: "", lineId: "", time: "" });
    expect(JSON.stringify(result.lead)).not.toContain("synthetic-phone");
    expect(result.lead.payloadHash).toBe(consultationPayloadSnapshot({ ...optedOut, phone: "other-private-value", contactName: "other-private-name" }).payloadHash);
  });

  it("resolves concurrent identical requestIds as one immutable lead and a no-op replay", async () => {
    let row: object | undefined;
    mocks.create.mockImplementation(async ({ data }) => {
      if (row) throw duplicate();
      row = { id: "lead-synthetic", ...data };
      return row;
    });
    mocks.findUnique.mockImplementation(async () => row);
    const results = await Promise.all([saveConsultationLead(payload), saveConsultationLead(payload)]);
    expect(results.map((result) => result.created)).toEqual([true, false]);
    expect(results[0].lead).toBe(results[1].lead);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { requestId: payload.requestId } });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("rejects reuse with changed content without overwriting or merging by name/contact", async () => {
    mocks.create.mockRejectedValue(duplicate());
    mocks.findUnique.mockResolvedValue({ id: "lead-synthetic", payloadHash: consultationPayloadSnapshot(payload).payloadHash });
    await expect(saveConsultationLead({ ...payload, storeName: "Changed synthetic studio" })).rejects.toBeInstanceOf(ConsultationRequestConflictError);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { requestId: payload.requestId } });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("does not conceal database failures or an unrelated unique conflict", async () => {
    mocks.create.mockRejectedValue(new Error("Synthetic unavailable"));
    await expect(saveConsultationLead(payload)).rejects.toThrow("Synthetic unavailable");
    expect(mocks.findUnique).not.toHaveBeenCalled();
    mocks.create.mockRejectedValue(duplicate());
    mocks.findUnique.mockResolvedValue(null);
    await expect(saveConsultationLead(payload)).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects invalid contact data before creating anything", async () => {
    await expect(saveConsultationLead({ ...payload, lineId: "", phone: "" })).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("single-attempt Sheet delivery", () => {
  it("allows only one concurrent PENDING-to-SENDING claim with a durable attempt timestamp", async () => {
    let state = "PENDING";
    mocks.updateMany.mockImplementation(async ({ where, data }) => {
      if (state !== where.sheetStatus) return { count: 0 };
      state = data.sheetStatus;
      return { count: 1 };
    });
    expect(await Promise.all([claimConsultationDelivery("lead-synthetic"), claimConsultationDelivery("lead-synthetic")])).toEqual([true, false]);
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "lead-synthetic", sheetStatus: "PENDING", sheetAttemptedAt: null }, data: { sheetStatus: "SENDING", sheetAttemptedAt: expect.any(Date) } });
  });

  it.each(["SENDING", "UNKNOWN", "CONFIRMED", "NOT_SENT_PREVIEW", "LEGACY_IMPORTED"])("never automatically retries %s, including a crashed/lost-response attempt", async (status) => {
    mocks.updateMany.mockImplementation(async ({ where }) => ({ count: status === where.sheetStatus ? 1 : 0 }));
    expect(await claimConsultationDelivery("lead-synthetic")).toBe(false);
    expect(mocks.updateMany.mock.calls[0][0].data.sheetStatus).toBe("SENDING");
    expect(mocks.updateMany.mock.calls[0][0].where).not.toHaveProperty("OR");
  });

  it.each(["CONFIRMED", "UNKNOWN"] as const)("finalizes SENDING to %s only", async (status) => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    expect(await markConsultationDelivery("lead-synthetic", status)).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "lead-synthetic", sheetStatus: "SENDING" }, data: status === "CONFIRMED" ? { sheetStatus: status, sheetConfirmedAt: expect.any(Date) } : { sheetStatus: status } });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await markConsultationDelivery("lead-synthetic", status)).toBe(false);
  });

  it("rejects invalid runtime final states", async () => {
    await expect(markConsultationDelivery("lead-synthetic", "PENDING" as "UNKNOWN")).rejects.toThrow("INVALID_CONSULTATION_SHEET_STATUS");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});

describe("explicit rollout and preview database isolation", () => {
  it.each([undefined, "false", "1", "TRUE"])("stays disabled for flag %s", async (flag) => {
    vi.stubEnv("CONSULTATION_HQ_ENABLED", flag);
    expect(consultationHqEnabled()).toBe(false);
    await expect(saveConsultationLead(payload)).rejects.toThrow("CONSULTATION_HQ_DISABLED");
    await expect(claimConsultationDelivery("lead-synthetic")).rejects.toThrow("CONSULTATION_HQ_DISABLED");
    await expect(markConsultationDelivery("lead-synthetic", "UNKNOWN")).rejects.toThrow("CONSULTATION_HQ_DISABLED");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("blocks unapproved preview database destinations before any query", async () => {
    mocks.allowed.mockReturnValue(false);
    await expect(saveConsultationLead(payload)).rejects.toThrow("CONSULTATION_DATABASE_NOT_ALLOWED");
    await expect(claimConsultationDelivery("lead-synthetic")).rejects.toThrow("CONSULTATION_DATABASE_NOT_ALLOWED");
    await expect(markConsultationDelivery("lead-synthetic", "UNKNOWN")).rejects.toThrow("CONSULTATION_DATABASE_NOT_ALLOWED");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});


describe("explicit isolated Preview-only receipt", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("CONSULTATION_PREVIEW_INTAKE_ENABLED", "true");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres");
    vi.stubEnv("DIRECT_URL", "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres");
  });

  it("creates an immutable never-send receipt only with explicit Preview intent", async () => {
    mocks.create.mockImplementation(async ({ data }) => ({ id: "preview-synthetic", ...data }));
    const result = await saveConsultationLead(payload, { previewOnly: true });
    expect(result.lead.sheetStatus).toBe("NOT_SENT_PREVIEW");
    expect(result.created).toBe(true);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("forbids normal saves and all delivery operations in Preview", async () => {
    await expect(saveConsultationLead(payload)).rejects.toThrow("CONSULTATION_PREVIEW_ONLY_REQUIRED");
    await expect(saveConsultationLead(payload, { previewOnly: false })).rejects.toThrow("CONSULTATION_PREVIEW_ONLY_REQUIRED");
    await expect(claimConsultationDelivery("preview-synthetic")).rejects.toThrow("CONSULTATION_PREVIEW_DELIVERY_DISABLED");
    await expect(markConsultationDelivery("preview-synthetic", "CONFIRMED")).rejects.toThrow("CONSULTATION_PREVIEW_DELIVERY_DISABLED");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("requires the separate opt-in and the usual rollout flag", async () => {
    vi.stubEnv("CONSULTATION_PREVIEW_INTAKE_ENABLED", "false");
    await expect(saveConsultationLead(payload, { previewOnly: true })).rejects.toThrow("CONSULTATION_PREVIEW_INTAKE_DISABLED");
    vi.stubEnv("CONSULTATION_PREVIEW_INTAKE_ENABLED", "true");
    vi.stubEnv("CONSULTATION_HQ_ENABLED", "false");
    await expect(saveConsultationLead(payload, { previewOnly: true })).rejects.toThrow("CONSULTATION_HQ_DISABLED");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("requires both isolated connection variables without routing overrides", async () => {
    vi.stubEnv("DIRECT_URL", "postgresql://postgres:synthetic@db.another-project.supabase.co:5432/postgres");
    await expect(saveConsultationLead(payload, { previewOnly: true })).rejects.toThrow("CONSULTATION_DATABASE_NOT_ALLOWED");
    vi.stubEnv("DIRECT_URL", "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres?host=production.invalid");
    await expect(saveConsultationLead(payload, { previewOnly: true })).rejects.toThrow("CONSULTATION_DATABASE_NOT_ALLOWED");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("forbids using the Preview-only option outside Preview", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CONSULTATION_PREVIEW_INTAKE_ENABLED", "false");
    await expect(saveConsultationLead(payload, { previewOnly: true })).rejects.toThrow("CONSULTATION_PREVIEW_INTAKE_DISABLED");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("replays only an identical existing Preview terminal record", async () => {
    mocks.create.mockRejectedValue(duplicate());
    mocks.findUnique.mockResolvedValue({ id: "preview-synthetic", sheetStatus: "NOT_SENT_PREVIEW", payloadHash: consultationPayloadSnapshot(payload).payloadHash });
    expect((await saveConsultationLead(payload, { previewOnly: true })).created).toBe(false);
    await expect(saveConsultationLead({ ...payload, storeName: "Changed synthetic studio" }, { previewOnly: true })).rejects.toBeInstanceOf(ConsultationRequestConflictError);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "SENDING", "UNKNOWN", "CONFIRMED"])("refuses to relabel a same-payload %s record as a Preview test", async (sheetStatus) => {
    mocks.create.mockRejectedValue(duplicate());
    mocks.findUnique.mockResolvedValue({ id: "existing-synthetic", sheetStatus, payloadHash: consultationPayloadSnapshot(payload).payloadHash });
    await expect(saveConsultationLead(payload, { previewOnly: true })).rejects.toBeInstanceOf(ConsultationRequestConflictError);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("cannot replay a Preview record through a normal production save", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CONSULTATION_PREVIEW_INTAKE_ENABLED", "false");
    mocks.create.mockRejectedValue(duplicate());
    mocks.findUnique.mockResolvedValue({ id: "preview-synthetic", sheetStatus: "NOT_SENT_PREVIEW", payloadHash: consultationPayloadSnapshot(payload).payloadHash });
    await expect(saveConsultationLead(payload)).rejects.toBeInstanceOf(ConsultationRequestConflictError);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
