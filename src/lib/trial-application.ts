import { z } from "zod";
export const TRIAL_CONTACT_EMAIL = "rock7652@gmail.com";
const text = z.string().trim().max(200);
function link(hosts: string[]) {
  return z
    .string()
    .trim()
    .max(2000)
    .refine((value) => {
      if (!value) return true;
      try {
        const u = new URL(value);
        return (
          u.protocol === "https:" &&
          !u.username &&
          !u.password &&
          hosts.includes(u.hostname)
        );
      } catch {
        return false;
      }
    }, "請貼上對應網站的 HTTPS 連結");
}
export const trialApplicationSchema = z
  .object({
    storeName: text.min(1, "請填店家名稱"),
    industry: z.enum(["運動教室", "音樂教室", "蒸足／養生", "其他"]),
    contactName: text.min(1, "請填聯絡人"),
    phone: text.min(6, "請填聯絡電話"),
    email: z.string().trim().email("請填有效 Email").max(200),
    mapsUrl: link([
      "maps.app.goo.gl",
      "goo.gl",
      "www.google.com",
      "maps.google.com",
    ]),
    lineStatus: z.enum(["existing", "new", "help"]),
    lineId: z.string().trim().max(100),
    friendUrl: link(["lin.ee", "line.me"]),
    inviteUrl: link(["manager.line.biz", "account.line.biz"]),
    developers: z.enum(["invited", "help", "pending"]),
    integration: z.enum(["none", "existing", "unknown"]),
    integrationName: text,
  })
  .strict();
export const trialDraftSchema = trialApplicationSchema
  .extend({
    storeName: text,
    contactName: text,
    phone: text,
    email: text,
    mapsUrl: z.string().max(2000),
    friendUrl: z.string().max(2000),
    inviteUrl: z.string().max(2000),
  })
  .partial();
export type TrialApplicationData = z.infer<typeof trialApplicationSchema>;
export const emptyTrialApplication: TrialApplicationData = {
  storeName: "",
  industry: "運動教室",
  contactName: "",
  phone: "",
  email: "",
  mapsUrl: "",
  lineStatus: "existing",
  lineId: "",
  friendUrl: "",
  inviteUrl: "",
  developers: "pending",
  integration: "unknown",
  integrationName: "",
};
export const applicationStatuses = {
  RECEIVED: "已收件",
  NEEDS_INFO: "待補件",
  CONFIGURING: "設定中",
  VERIFYING: "待驗收",
  READY: "已完成",
  CLOSED: "已結案",
} as const;
export function trialChecklist(d: TrialApplicationData) {
  return [
    {
      label: "店家與聯絡資料",
      state:
        d.storeName && d.contactName && d.phone && d.email
          ? "已提供"
          : "待填寫",
    },
    { label: "Google 地圖", state: d.mapsUrl ? "已提供" : "可稍後補充" },
    {
      label: "官方 LINE ID／好友連結",
      state:
        d.lineId && d.friendUrl
          ? "已提供"
          : d.lineStatus === "help"
            ? "需要協助"
            : "待補充",
    },
    {
      label: "官方 LINE 管理員邀請",
      state: d.inviteUrl ? "已提供，待確認" : "待補充",
    },
    {
      label: "LINE Developers 授權",
      state:
        d.developers === "invited"
          ? "已邀請，待確認"
          : d.developers === "help"
            ? "需要協助"
            : "待補充",
    },
    {
      label: "既有串接",
      state:
        d.integration === "unknown"
          ? "需要確認"
          : d.integration === "existing"
            ? "已有串接，需確認"
            : "無既有串接",
    },
  ];
}
