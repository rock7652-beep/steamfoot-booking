import { createHash } from "node:crypto";
import { z } from "zod";

const key = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const text = z.string().max(20_000);
const historical = z.object({ sourceStudentId: key }).passthrough();
const table = z.object({ headers: z.array(text).max(50), rows: z.array(z.array(text).max(50)).max(10_000) }).passthrough();
const tables = z.object({ tables: z.array(table).max(2_000) }).passthrough();
const sourceRecord = z.object({ id: key, name: text, tuition: z.array(tables).max(2_000), attendance: tables, schedule: tables }).passthrough();
export const musicSourceImportSchema = z.object({
  schema: z.literal("injiaoyun-migration-draft-v1"), sourceSystem: z.literal("音教雲"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  students: z.array(z.object({ sourceStudentId: key, name: text.min(1), phone: text,
    notes: text, legacyLineStatus: text, targetCustomerId: z.null(),
  }).passthrough()).min(1).max(100),
  tuition: z.array(historical.extend({ periodRaw: text, expiryRaw: text, chargeName: text,
    amountDue: z.number().finite().nullable(), amountReceived: z.number().finite().nullable(), debt: z.number().finite().nullable(),
    importAsHistoricalOnly: z.literal(true),
  })).max(10_000),
  attendanceGroups: z.array(historical.extend({ replayLessonDeduction: z.literal(false),
    rows: z.array(z.object({ attendanceDateRaw: text, leaveDateRaw: text, teacherName: text }).passthrough()).max(2_000),
  })).max(2_000),
  schedule: z.array(historical.extend({ dateRaw: text, timeRaw: text, teacherName: text, sourceCategory: text })).max(10_000),
  sourceRecords: z.array(sourceRecord).max(100),
}).passthrough();
export type MusicSourceImport = z.infer<typeof musicSourceImportSchema>;
export type SourceCustomer = { id: string; name: string; phone: string; serviceNote: string | null; mergedIntoCustomerId: string | null };
export const SOURCE_TENANT = "www.injiaoyun.com:store-lubymusic";
export function sourceStudentMarker(id: string) { return `SOURCE_REPLICA|YINJIAOYUN|${SOURCE_TENANT}|STUDENT|${id}`; }
/** The persisted discriminator is for matching, never a customer-facing note. */
export function musicSourceDisplayNote(value: string | null | undefined) {
  return value?.startsWith(`SOURCE_REPLICA|YINJIAOYUN|${SOURCE_TENANT}|STUDENT|`) ? "" : value;
}
export function sourceCustomerId(id: string) { return `yjy-lubymusic-student-${id}`; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function sourceImportHash(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
export function sourceBatchId(hash: string) { return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`; }

/** Validate references before a database connection or mutation is made. Dates,
 * receipts and lesson balances stay exactly as observed; none are inferred. */
export function parseMusicSourceImport(raw: unknown): MusicSourceImport {
  const data = musicSourceImportSchema.parse(raw);
  const ids = new Set(data.students.map(s => s.sourceStudentId));
  if (ids.size !== data.students.length) throw new Error("學生來源編號重複");
  for (const row of [...data.tuition, ...data.attendanceGroups, ...data.schedule]) {
    if (!ids.has(row.sourceStudentId)) throw new Error("歷史資料沒有對應的來源學生");
  }
  const rawIds = new Set(data.sourceRecords.map(r => r.id));
  if (rawIds.size !== data.sourceRecords.length || rawIds.size !== ids.size || [...ids].some(id => !rawIds.has(id))) throw new Error("原始資料與學生名單不一致");
  for (const row of data.sourceRecords) {
    if (data.students.find(s => s.sourceStudentId === row.id)?.name !== row.name) throw new Error("原始資料姓名不一致");
    const rawTuition = row.tuition.flatMap(g => g.tables.flatMap(t => t.rows));
    const rawAttendance = row.attendance.tables.filter(t => t.headers[0] === "簽到日期").flatMap(t => t.rows);
    const rawSchedule = row.schedule.tables.flatMap(t => t.rows);
    if (rawTuition.length !== data.tuition.filter(r => r.sourceStudentId === row.id).length ||
      rawAttendance.length !== data.attendanceGroups.filter(r => r.sourceStudentId === row.id).reduce((n, g) => n + g.rows.length, 0) ||
      rawSchedule.length !== data.schedule.filter(r => r.sourceStudentId === row.id).length) throw new Error("來源與整理後的紀錄筆數不一致");
  }
  return data;
}

export function planMusicSourceImport(data: MusicSourceImport, existing: SourceCustomer[]) {
  const counts = { students: data.students.length, tuition: data.tuition.length,
    attendance: data.attendanceGroups.reduce((n, g) => n + g.rows.length, 0), schedule: data.schedule.length };
  const rows = data.students.map(student => {
    const id = sourceCustomerId(student.sourceStudentId), marker = sourceStudentMarker(student.sourceStudentId);
    const matches = existing.filter(c => c.id === id || c.serviceNote === marker);
    const phone = student.phone.trim();
    let disposition: "CREATE" | "EXISTING" | "REVIEW" = "CREATE", reason = "可新增學生基本資料";
    if (matches.length) {
      const match = matches[0];
      if (matches.length === 1 && match.id === id && match.serviceNote === marker && match.name === student.name && match.phone === phone && !match.mergedIntoCustomerId) {
        disposition = "EXISTING"; reason = "同來源學生已存在，不重複新增";
      } else { disposition = "REVIEW"; reason = "既有來源學生有差異，保留原資料並待核對"; }
    } else if (!/^0\d{8,9}$/.test(phone)) { disposition = "REVIEW"; reason = "電話空白或格式待確認；先保存原始資料"; }
    else if (data.students.filter(s => s.phone.trim() === phone).length > 1 || existing.some(c => c.phone === phone)) {
      disposition = "REVIEW"; reason = "電話與其他學生共用，需確認家長／學生對應";
    }
    const tuition = data.tuition.filter(r => r.sourceStudentId === student.sourceStudentId);
    return { sourceStudentId: student.sourceStudentId, name: student.name, phone: student.phone, disposition, reason,
      tuition: tuition.map(r => ({ period: r.periodRaw, expiry: r.expiryRaw, charge: r.chargeName, due: r.amountDue, received: r.amountReceived, debt: r.debt })),
      attendance: data.attendanceGroups.filter(g => g.sourceStudentId === student.sourceStudentId).flatMap(g => g.rows),
      schedule: data.schedule.filter(r => r.sourceStudentId === student.sourceStudentId).map(r => ({ category: r.sourceCategory, date: r.dateRaw, time: r.timeRaw, teacher: r.teacherName })),
      warnings: tuition.some(r => r.amountDue !== null && r.amountReceived !== null && r.debt !== null && Math.abs(r.amountDue - r.amountReceived - r.debt) > 0.01)
        ? ["學費應收、實收與欠款有差異，需連同折扣原文核對"] : [],
    };
  });
  return { sourceDate: data.date, counts, rows,
    create: rows.filter(r => r.disposition === "CREATE").length,
    existing: rows.filter(r => r.disposition === "EXISTING").length,
    review: rows.filter(r => r.disposition === "REVIEW").length,
    limitations: ["歷史學費、排課、簽到保留為來源紀錄。", "來源未提供的總堂數、餘額、付款明細及教師／教室對應，仍需核實後才能啟用。", "只備份目前帳號可讀取的資料；排課紀錄可能僅涵蓋近兩個月。"],
  };
}
export type MusicSourcePreview = ReturnType<typeof planMusicSourceImport>;
