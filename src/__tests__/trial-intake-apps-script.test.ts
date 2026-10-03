import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  trialNotificationSummary,
  emptyTrialApplication,
} from "@/lib/trial-application";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("scripts/trial-intake-apps-script.gs", "utf8");
const id = "87a6e770-19de-4ca2-a705-f2b0a229f2e7";
function fixture() {
  const rows: unknown[][] = [
    [
      "申請編號",
      "申請時間",
      "更新時間",
      "店家名稱",
      "使用類型",
      "聯絡人",
      "電話",
      "Email",
      "Google 地圖",
      "官方 LINE ID",
      "好友連結",
      "待補資料",
      "處理狀態",
      "備註",
      "資料版本",
      "已通知版本",
    ],
  ];
  const send = vi.fn(),
    release = vi.fn();
  const sheet = {
    getLastRow: () => rows.length,
    getRange: (row: number, col: number, height = 1, width = 1) => ({
      getValues: () =>
        rows
          .slice(row - 1, row - 1 + height)
          .map((r) => r.slice(col - 1, col - 1 + width)),
      setValues: (values: unknown[][]) =>
        values.forEach((values, i) => {
          rows[row - 1 + i] ??= [];
          values.forEach((value, j) => {
            rows[row - 1 + i][col - 1 + j] = value;
          });
        }),
      setValue: (value: unknown) => {
        rows[row - 1][col - 1] = value;
      },
    }),
  };
  const context = {
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => "s".repeat(64) }),
    },
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: () => sheet }),
      flush: vi.fn(),
    },
    MailApp: { sendEmail: send, getRemainingDailyQuota: () => 50 },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        hasLock: () => true,
        releaseLock: release,
      }),
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (s: string) => ({ setMimeType: () => JSON.parse(s) }),
    },
  };
  const post = runInNewContext(source + "\ndoPost;", context);
  const application = {
    id,
    revision: 1,
    createdAt: "2026-10-02T02:00:00Z",
    updatedAt: "2026-10-02T02:00:00Z",
    storeName: "虛構教室",
    industry: "音樂教室",
    contactName: "測試",
    phone: "0000000000",
    email: "test@example.invalid",
    mapsUrl: "",
    lineId: "",
    friendUrl: "",
    missing: "LINE：待補充",
    status: "已收件",
  };
  const submit = (a = application, secret = "s".repeat(64)) =>
    post({
      postData: {
        contents: JSON.stringify({
          secret,
          application: a,
          hqUrl: `https://www.steamfoot.com/hq/dashboard/trial-applications?application=${id}`,
        }),
      },
    });
  return { rows, send, release, submit, application };
}
describe("Google Sheet and mail receiver", () => {
  it("sets up without an editor UI and reuses the existing secret", () => {
    const props = new Map<string, string>();
    const log = vi.fn(),
      quota = vi.fn(),
      send = vi.fn();
    const range = {
      setValues: vi.fn(),
      setNumberFormat: vi.fn(),
      createFilter: vi.fn(),
      setBackground: () => ({
        setFontColor: () => ({ setFontWeight: vi.fn() }),
      }),
    };
    const sheet = {
      getRange: () => range,
      setFrozenRows: vi.fn(),
      getFilter: () => true,
    };
    const setup = runInNewContext(source + "\nsetupIntake;", {
      console: { log },
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (key: string) => props.get(key),
          setProperty: (key: string, value: string) => props.set(key, value),
        }),
      },
      Utilities: { getUuid: () => "01234567-89ab-cdef-0123-456789abcdef" },
      SpreadsheetApp: {
        openById: () => ({
          getSheetByName: () => sheet,
          setSpreadsheetTimeZone: vi.fn(),
        }),
      },
      MailApp: { getRemainingDailyQuota: quota, sendEmail: send },
    });
    setup();
    expect(props.get("INTAKE_SECRET")).toHaveLength(64);
    const secret = props.get("INTAKE_SECRET");
    setup();
    expect(props.get("INTAKE_SECRET")).toBe(secret);
    expect(quota).toHaveBeenCalledTimes(2);
    expect(send).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(2);
  });
  it("adds one row and sends directly to the official mailbox", () => {
    const f = fixture();
    expect(f.submit()).toMatchObject({
      ok: true,
      sheet: "SAVED",
      mail: "SENT",
      revision: 1,
    });
    expect(f.rows).toHaveLength(2);
    expect(f.rows[1][6]).toBe("0000000000");
    expect(f.send.mock.calls[0][0].to).toBe("steambutler500@gmail.com");
    expect(f.send.mock.calls[0][0].body).toContain("LINE：待補充");
    expect(f.release).toHaveBeenCalled();
  });
  it("deduplicates retry and updates the same row on supplement", () => {
    const f = fixture();
    f.submit();
    f.submit();
    expect(f.send).toHaveBeenCalledTimes(1);
    f.rows[1][12] = "設定中";
    f.rows[1][13] = "已電話聯絡";
    expect(
      f.submit({ ...f.application, revision: 2, storeName: "新名稱" }),
    ).toMatchObject({ ok: true, revision: 2 });
    expect(f.rows).toHaveLength(2);
    expect(f.rows[1][3]).toBe("新名稱");
    expect(f.rows[1][12]).toBe("設定中");
    expect(f.rows[1][13]).toBe("已電話聯絡");
    expect(f.send.mock.calls[1][0].subject).toContain("補件通知");
    f.submit();
    expect(f.rows[1][3]).toBe("新名稱");
    expect(f.send).toHaveBeenCalledTimes(2);
  });
  it("keeps the sheet row when mail fails and allows a later retry", () => {
    const f = fixture();
    f.send.mockImplementationOnce(() => {
      throw new Error("mail unavailable");
    });
    expect(f.submit()).toEqual({ ok: false });
    expect(f.rows).toHaveLength(2);
    expect(f.rows[1][15]).toBe(0);
    expect(f.submit()).toMatchObject({ ok: true, mail: "SENT" });
    expect(f.rows).toHaveLength(2);
  });
  it("rejects unauthenticated writes and mail", () => {
    const f = fixture();
    expect(f.submit(f.application, "wrong")).toEqual({ ok: false });
    expect(f.rows).toHaveLength(1);
    expect(f.send).not.toHaveBeenCalled();
  });
  it("stores spreadsheet formula strings safely", () => {
    const f = fixture();
    f.submit({
      ...f.application,
      storeName: '=IMPORTXML("https://example.invalid", "*")',
      lineId: "@example",
    });
    expect(f.rows[1][3]).toMatch(/^'=/);
    expect(f.rows[1][9]).toBe("'@example");
  });
});

it("existing deployed receiver retains new configuration in the same row and mail", () => {
  const f = fixture();
  const missing = trialNotificationSummary({
    ...emptyTrialApplication,
    brandName: "多店品牌",
    slug: "butler",
    providerAdmin: "invited",
    staffNotes: "教練甲",
    planNotes: "10堂方案",
  });
  expect(f.submit({ ...f.application, missing })).toMatchObject({
    ok: true,
    mail: "SENT",
  });
  expect(f.rows[1][11]).toContain("多店品牌");
  expect(f.rows[1][11]).toContain("10堂方案");
  expect(f.send.mock.calls[0][0].body).toContain(
    "Provider Admin：已邀請，待確認",
  );
  expect(f.send.mock.calls[0][0].body).toContain("希望網址：butler");
});
