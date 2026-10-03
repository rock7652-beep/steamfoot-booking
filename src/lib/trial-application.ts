import { z } from "zod";
export const TRIAL_CONTACT_EMAIL = "rock7652@gmail.com";
export const TRIAL_NOTIFICATION_EMAIL = "steambutler500@gmail.com";
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
export const authorizationProgress = z.enum([
  "pending",
  "invited",
  "help",
  "absent",
]);
export const setupProgress = z.enum(["provided", "none", "help", "pending"]);
export const attachmentSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[^\/\\\u0000-\u001f]+$/),
    type: z.enum(["pdf", "png", "jpg", "xlsx", "docx", "csv"]),
    content: z
      .string()
      .max(2_800_000)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  })
  .strict()
  .refine((a) => {
    try {
      const raw = atob(a.content);
      if (
        !raw.length ||
        raw.length > 2 * 1024 * 1024 ||
        btoa(raw) !== a.content
      )
        return false;
      return a.type === "pdf"
        ? raw.startsWith("%PDF-")
        : a.type === "png"
          ? raw.startsWith("\x89PNG\r\n\x1a\n")
          : a.type === "jpg"
            ? raw.startsWith("\xff\xd8\xff")
            : ["xlsx", "docx"].includes(a.type)
              ? raw.startsWith("PK\x03\x04")
              : !raw.includes("\x00");
    } catch {
      return false;
    }
  }, "附件格式有誤或超過 2 MB");
const trialApplicationObject = z
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
    brandName: text.default(""),
    otherStores: text.default(""),
    slug: z
      .string()
      .trim()
      .max(50)
      .regex(
        /^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/,
        "請用小寫英文、數字或短橫線，不含空格",
      )
      .default(""),
    additionalManagers: text.default(""),
    sharedLine: z.enum(["no", "yes", "unknown"]).default("unknown"),
    sharedLineStores: text.default(""),
    lineManagerContact: text.default(""),
    providerAdmin: authorizationProgress.default("pending"),
    messagingAdmin: authorizationProgress.default("pending"),
    loginAdmin: authorizationProgress.default("pending"),
    staffProgress: setupProgress.default("pending"),
    roomProgress: setupProgress.default("pending"),
    scheduleProgress: setupProgress.default("pending"),
    planProgress: setupProgress.default("pending"),
    rulesProgress: setupProgress.default("pending"),
    staffNotes: text.default(""),
    roomNotes: text.default(""),
    scheduleNotes: text.default(""),
    planNotes: text.default(""),
    rulesNotes: text.default(""),
    importStudents: z.enum(["yes", "no", "help", "pending"]).default("pending"),
    attachments: z
      .array(attachmentSchema)
      .max(3)
      .refine(
        (a) =>
          a.reduce((n, f) => {
            try {
              return n + atob(f.content).length;
            } catch {
              return Infinity;
            }
          }, 0) <=
          2 * 1024 * 1024,
        "附件合計最多 2 MB",
      )
      .default([]),
  })
  .strict();
export const trialDraftSchema = trialApplicationObject
  .extend({
    storeName: text,
    contactName: text,
    phone: text,
    email: text,
    mapsUrl: z.string().max(2000),
    friendUrl: z.string().max(2000),
    inviteUrl: z.string().max(2000),
    slug: z.string().max(50),
  })
  .partial();
export const trialApplicationSchema = trialApplicationObject.superRefine(
  (d, ctx) => {
    if (trialNotificationSummary(d).length > 2500)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rulesNotes"],
        message:
          "文字摘要較長，請將課表／方案等改以附件提供（摘要合計最多 2500 字）。",
      });
  },
);
export type TrialApplicationData = z.infer<typeof trialApplicationObject>;
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
  brandName: "",
  otherStores: "",
  slug: "",
  additionalManagers: "",
  sharedLine: "unknown",
  sharedLineStores: "",
  lineManagerContact: "",
  providerAdmin: "pending",
  messagingAdmin: "pending",
  loginAdmin: "pending",
  staffProgress: "pending",
  roomProgress: "pending",
  scheduleProgress: "pending",
  planProgress: "pending",
  rulesProgress: "pending",
  staffNotes: "",
  roomNotes: "",
  scheduleNotes: "",
  planNotes: "",
  rulesNotes: "",
  importStudents: "pending",
  attachments: [],
};
export const applicationStatuses = {
  RECEIVED: "已收件",
  NEEDS_INFO: "待補件",
  CONFIGURING: "設定中",
  VERIFYING: "待驗收",
  READY: "已完成",
  CLOSED: "已結案",
} as const;
export const setupSections = [
  ["staffProgress", "staffNotes", "教練名單", "姓名、教授課程；鐘點費選填"],
  ["roomProgress", "roomNotes", "教室／場地", "名稱、可容納人數"],
  [
    "scheduleProgress",
    "scheduleNotes",
    "課表",
    "課名、老師、場地、星期／日期、時間、時長、人數上限與循環方式",
  ],
  [
    "planProgress",
    "planNotes",
    "收費方案",
    "名稱、金額、堂數、期限、適用課程與跨店規則",
  ],
  [
    "rulesProgress",
    "rulesNotes",
    "預約規則",
    "預約開放、預約／取消截止、候補與請假／未到扣堂",
  ],
] as const;
export function trialSetupSummary(d: TrialApplicationData) {
  return [
    `品牌：${d.brandName || "未提供"}`,
    `其他門市：${d.otherStores || "無／未提供"}`,
    `希望網址：${d.slug || "需要協助"}（待確認）`,
    `其他後台使用者：${d.additionalManagers || "無／未提供"}`,
    `共用 LINE：${{ yes: "是", no: "否", unknown: "待確認" }[d.sharedLine]} ${d.sharedLineStores}`,
    `LINE 管理聯絡人：${d.lineManagerContact || "未提供"}`,
    ...setupSections.map(
      ([, notes, label]) => `${label}：${d[notes] || "見附件／待補充"}`,
    ),
    `附件：${d.attachments.map((a) => a.name).join("、") || "無"}（由總部查看）`,
  ].join("\n");
}
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
    ...(
      [
        ["providerAdmin", "Provider Admin"],
        ["messagingAdmin", "Messaging API Admin"],
        ["loginAdmin", "LINE Login Admin"],
      ] as const
    ).map(([key, label]) => ({
      label,
      state:
        d[key] === "invited"
          ? "已邀請，待確認 Admin"
          : d[key] === "help"
            ? "需要協助"
            : d[key] === "absent"
              ? "尚未建立，需協助"
              : "待補充",
    })),
    {
      label: "網址英文名稱",
      state: d.slug ? "已提供，待確認可用" : "需要協助",
    },
    ...setupSections.map(([key, notes, label]) => ({
      label,
      state:
        d[key] === "none"
          ? "不需要"
          : d[key] === "help"
            ? "需要協助"
            : d[key] === "provided" && (d[notes] || d.attachments.length)
              ? "已提供"
              : "待補充",
    })),
    {
      label: "現有學員匯入",
      state:
        d.importStudents === "no"
          ? "不需要"
          : d.importStudents === "yes"
            ? "需要匯入，待提供格式"
            : d.importStudents === "help"
              ? "需要協助"
              : "待確認",
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

export function trialNotificationSummary(d: TrialApplicationData) {
  const missing = trialChecklist(d)
    .filter((i) => !["已提供", "不需要", "無既有串接"].includes(i.state))
    .map((i) => `${i.label}：${i.state}`)
    .join("\n");
  return `【待補／待核對】\n${missing || "無，待人工驗收"}\n\n【申請設定摘要】\n${trialSetupSummary(d)}`;
}
