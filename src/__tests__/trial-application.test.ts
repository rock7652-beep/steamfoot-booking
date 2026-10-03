import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import {
  emptyTrialApplication,
  trialApplicationSchema,
  trialDraftSchema,
  trialChecklist,
  trialNotificationSummary,
} from "@/lib/trial-application";
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  count: vi.fn(),
  notify: vi.fn(),
  allowed: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { trialApplication: mocks } }));
vi.mock("@/server/services/trial-application-notification", () => ({
  notifyTrialApplication: mocks.notify,
}));
vi.mock("@/server/services/trial-application-access", () => ({
  trialApplicationDatabaseAllowed: mocks.allowed,
  allowTrialRequest: mocks.rate,
}));
import { POST } from "@/app/api/trial-applications/route";
const data = {
  ...emptyTrialApplication,
  storeName: "音樂教室",
  contactName: "店家",
  phone: "0912345678",
  email: "store@example.com",
};
const token = "a".repeat(64);
const requestId = "b4b32e57-3bf9-4e47-a98f-2d8ef21a9e62";
const record = {
  id: "test-id",
  requestId,
  resumeTokenHash: createHash("sha256").update(token).digest("hex"),
  payload: data,
  revision: 1,
  status: "RECEIVED",
  notificationStatus: "PENDING",
};
const request = (body: unknown, origin = "https://example.com") =>
  new NextRequest("https://example.com/api/trial-applications", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.allowed.mockReturnValue(true);
  mocks.rate.mockReturnValue(true);
  mocks.findUnique.mockResolvedValue(null);
  mocks.count.mockResolvedValue(0);
  mocks.create.mockResolvedValue(record);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.update.mockResolvedValue(record);
  mocks.notify.mockResolvedValue("SENT");
});
describe("trial application input", () => {
  it("restores unfinished draft with blank email and incomplete URL", () =>
    expect(
      trialDraftSchema.safeParse({
        ...emptyTrialApplication,
        storeName: "尚在填寫",
        inviteUrl: "https://manager.",
      }).success,
    ).toBe(true));
  it("allows submitting basic information before LINE authorization", () => {
    expect(trialApplicationSchema.safeParse(data).success).toBe(true);
    expect(
      trialChecklist(data).find((x) => x.label === "Provider Admin")?.state,
    ).toBe("待補充");
  });
  it.each([
    "javascript:alert(1)",
    "https://manager.line.biz.evil.example/invite",
    "https://evil.example/invite",
    "https://user:password@manager.line.biz/invite",
  ])("rejects unsafe invite %s", (inviteUrl) => {
    expect(
      trialApplicationSchema.safeParse({ ...data, inviteUrl }).success,
    ).toBe(false);
  });
  it("marks invitation supplied separately from verified access", () =>
    expect(
      trialChecklist({ ...data, developers: "invited" }).find((x) =>
        x.label.includes("Developers"),
      )?.state,
    ).toBe("已邀請，待確認"));
});
describe("receipt boundary", () => {
  it("blocks requests from another origin before database access", async () => {
    expect(
      (
        await POST(
          request(
            { requestId, token, action: "save", data },
            "https://evil.example",
          ),
        )
      ).status,
    ).toBe(403);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("blocks production database access on unsafe Preview", async () => {
    mocks.allowed.mockReturnValue(false);
    expect(
      (await POST(request({ requestId, token, action: "save", data }))).status,
    ).toBe(503);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("requires valid supplement token before returning data", async () => {
    mocks.findUnique.mockResolvedValue(record);
    const res = await POST(
      request({ requestId, token: "b".repeat(64), action: "read" }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).not.toHaveProperty("data");
  });
  it("persists only a token hash and returns receipt despite failed mail", async () => {
    mocks.notify.mockResolvedValue("FAILED");
    const res = await POST(request({ requestId, token, action: "save", data }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "test-id", revision: 1 });
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      resumeTokenHash: record.resumeTokenHash,
    });
    expect(mocks.create.mock.calls[0][0].data).not.toHaveProperty("token");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "test-id", revision: 1, notificationStatus: "SENDING" },
      data: { notificationStatus: "FAILED" },
    });
  });
  it("returns durable receipt even if storing notification result fails", async () => {
    mocks.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error("connection dropped"));
    expect(
      (await POST(request({ requestId, token, action: "save", data }))).status,
    ).toBe(200);
  });
  it("deduplicates initial response-loss retry even with reordered JSONB keys", async () => {
    mocks.findUnique.mockResolvedValue({
      ...record,
      payload: Object.fromEntries(Object.entries(data).reverse()),
    });
    const res = await POST(request({ requestId, token, action: "save", data }));
    expect(res.status).toBe(200);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("prevents stale supplements overwriting newer data", async () => {
    mocks.findUnique.mockResolvedValue({ ...record, revision: 3 });
    const res = await POST(
      request({
        requestId,
        token,
        action: "save",
        revision: 1,
        data: { ...data, storeName: "另一個名称" },
      }),
    );
    expect(res.status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("supplements the same record and preserves HQ status", async () => {
    mocks.findUnique.mockResolvedValue({ ...record, status: "CONFIGURING" });
    mocks.findUniqueOrThrow.mockResolvedValue({
      ...record,
      revision: 2,
      status: "CONFIGURING",
      notificationStatus: "PENDING",
    });
    const res = await POST(
      request({
        requestId,
        token,
        action: "save",
        revision: 1,
        data: { ...data, friendUrl: "https://lin.ee/example" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      revision: 2,
      status: "CONFIGURING",
    });
    expect(mocks.updateMany.mock.calls[0][0].data).not.toHaveProperty("status");
    expect(mocks.updateMany.mock.calls[0][0].data.notificationStatus).toBe(
      "PENDING",
    );
    expect(mocks.notify).toHaveBeenCalledWith("test-id");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "test-id", revision: 2, notificationStatus: "SENDING" },
      data: { notificationStatus: "SENT" },
    });
  });
});

describe("complete per-store intake", () => {
  it("accepts old records and fills new fields for supplements", () => {
    const legacy = {
      storeName: data.storeName,
      industry: data.industry,
      contactName: data.contactName,
      phone: data.phone,
      email: data.email,
      mapsUrl: "",
      lineStatus: "existing",
      lineId: "",
      friendUrl: "",
      inviteUrl: "",
      developers: "pending",
      integration: "unknown",
      integrationName: "",
    };
    expect(trialApplicationSchema.parse(legacy).attachments).toEqual([]);
    expect(trialApplicationSchema.parse(legacy).providerAdmin).toBe("pending");
  });
  it.each(["UFUN", "a b", "-butler", "admin/path"])(
    "rejects invalid slug %s",
    (slug) =>
      expect(trialApplicationSchema.safeParse({ ...data, slug }).success).toBe(
        false,
      ),
  );
  it("allows requested but unallocated slug and independent admin progress", () => {
    const d = trialApplicationSchema.parse({
      ...data,
      slug: "butler",
      providerAdmin: "invited",
      messagingAdmin: "absent",
      loginAdmin: "help",
    });
    expect(trialChecklist(d)).toContainEqual({
      label: "Provider Admin",
      state: "已邀請，待確認 Admin",
    });
    expect(trialNotificationSummary(d)).toContain(
      "Messaging API Admin：尚未建立",
    );
    expect(trialNotificationSummary(d)).toContain("希望網址：butler（待確認）");
  });
  it("rejects fabricated file bytes and oversized aggregate without throwing", () => {
    expect(
      trialApplicationSchema.safeParse({
        ...data,
        attachments: [
          { name: "bad.pdf", type: "pdf", content: btoa("not a PDF") },
        ],
      }).success,
    ).toBe(false);
    expect(
      trialApplicationSchema.safeParse({
        ...data,
        attachments: [
          { name: "bad.pdf", type: "pdf", content: "!not base64!" },
        ],
      }).success,
    ).toBe(false);
  });
  it("requires notes or attachment when claiming setup provided", () => {
    expect(
      trialChecklist({ ...data, planProgress: "provided" }).find(
        (i) => i.label === "收費方案",
      )?.state,
    ).toBe("待補充");
  });
  it("notification contains submitted configuration but no attachment content", () => {
    const d = trialApplicationSchema.parse({
      ...data,
      brandName: "品牌",
      staffNotes: "老師甲",
      attachments: [
        { name: "課表.pdf", type: "pdf", content: btoa("%PDF-1.7 test") },
      ],
    });
    const summary = trialNotificationSummary(d);
    expect(summary).toContain("品牌：品牌");
    expect(summary).toContain("教練名單：老師甲");
    expect(summary).toContain("課表.pdf");
    expect(summary).not.toContain(d.attachments[0].content);
    expect(summary.length).toBeLessThanOrEqual(2500);
  });
  it("limits repeated requests per store instead of all stores sharing an email", async () => {
    await POST(request({ requestId, token, action: "save", data }));
    expect(mocks.count.mock.calls[0][0].where).toMatchObject({
      storeName: data.storeName,
      contactEmail: data.email,
    });
  });
});
