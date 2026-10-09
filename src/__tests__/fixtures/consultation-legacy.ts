import { payloadSchema } from "@/lib/consultation-lead";
import { sha256, type LegacyApproval, type LegacySourceObservation, type LegacyTarget } from "@/lib/consultation-legacy-import";

/** Entirely synthetic. No source UUID, business contact or production payload. */
export function legacyFixture() {
  const target: LegacyTarget = { environment: "production", projectId: "abcdefghijklmnopqrst", database: "postgres", schema: "public" };
  const source: LegacySourceObservation = { spreadsheetId: "synthetic_spreadsheet", sheetId: 12, timezone: "Etc/GMT", rows: [] };
  const rows = Array.from({ length: 4 }, (_, index) => {
    const requestId = `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const createdAt = new Date(Date.parse("2026-03-02T23:17:53.984Z") + index).toISOString();
    const serial = Date.parse(createdAt) / 86400000 + 25569;
    const phone = index % 2 === 0 ? `90000000${index + 1}` : "";
    const payload = payloadSchema.parse({ requestId, storeName: `合成門市 ${index + 1}`, contactName: "合成聯絡人", industry: "其他服務型門市",
      phone, lineId: "synthetic-contact-only", needs: ["合成需求"], replaceReason: [], source: "website" });
    const values = Array<string>(30).fill("");
    values[0] = createdAt; values[1] = payload.storeName; values[2] = payload.contactName!; values[3] = payload.industry;
    values[14] = phone; values[16] = "待聯繫"; values[18] = payload.lineId!; values[27] = requestId; values[28] = "已寄送"; values[29] = sha256(`synthetic-original-${index}`);
    source.rows.push({ sourceRow: index + 2, formattedValues: values, dateSerial: serial, cellNotes: [] });
    return { classification: "real_candidate_pending_root_review", sourceRow: index + 2, originalRequestId: requestId,
      rawRowSha256: sha256(JSON.stringify(values)), sourceSubmissionFingerprint: values[29],
      sourceDate: { createdAt, serial, timezone: "Etc/GMT" }, originalStatus: "待聯繫", mappedStatus: "NEW", originalFollowUpNote: "", originalNotificationStatus: "已寄送",
      canonicalHqPayload: payload, canonicalHqPayloadHash: sha256(JSON.stringify(payload)),
      phoneImport: { observedText: phone, normalizedText: phone, altered: false },
      warnings: phone ? ["PHONE_STORED_AS_NUMBER: synthetic numeric cell"] : [] };
  });
  const manifest = { schemaVersion: 1, kind: "PRIVATE_READ_ONLY_AUDIT_NOT_AN_IMPORT", spreadsheetId: source.spreadsheetId,
    sourceSheetId: source.sheetId, snapshotSha256: sha256("synthetic snapshot"), totals: { summaryMirrorRows: 14 },
    rows: [...rows, ...Array.from({ length: 13 }, () => ({ classification: "excluded_explicit_test" }))] };
  const manifestText = JSON.stringify(manifest);
  const approval: LegacyApproval = { target, manifestSha256: sha256(manifestText), snapshotSha256: manifest.snapshotSha256,
    requestIds: rows.map(row => row.originalRequestId), expectedCandidates: 4 };
  return { target, source, manifest, manifestText, snapshotText: "synthetic snapshot", approval, rows };
}
