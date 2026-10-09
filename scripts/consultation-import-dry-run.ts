/** Local review only: deliberately no database client, network, import/apply switch or output PII. */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { payloadSchema, sanitizeConsultationPayload } from "../src/lib/consultation-lead";
const inputSchema = z.array(z.object({
  sourceRow: z.number().int().min(2),
  createdAt: z.string().datetime({offset:true}),
  payload: payloadSchema,
}).strict()).max(10000);
export function reviewConsultationImport(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { valid: false, rows: 0, duplicateRequestIds: 0, conflictingRequestIds: 0, applySupported: false };
  const ids = new Map<string,string>(); let duplicates=0; let conflicts=0;
  for (const row of parsed.data) {
    const payload = sanitizeConsultationPayload(row.payload);
    const fingerprint = JSON.stringify(payload);
    const existing = ids.get(payload.requestId);
    if (existing !== undefined) { if (existing === fingerprint) duplicates++; else conflicts++; }
    else ids.set(payload.requestId,fingerprint);
  }
  return { valid: conflicts === 0, rows: parsed.data.length, uniqueRequests: ids.size,
    duplicateRequestIds: duplicates, conflictingRequestIds: conflicts, applySupported: false,
    databaseDuplicatesChecked: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) { console.error("Usage: tsx scripts/consultation-import-dry-run.ts <private-review.json>; read-only validation, no import"); process.exitCode=2; }
  else {
    try { const result=reviewConsultationImport(JSON.parse(readFileSync(process.argv[2],"utf8"))); console.log(JSON.stringify(result)); if(!result.valid)process.exitCode=1; }
    catch { console.error("Invalid review file; nothing imported"); process.exitCode=1; }
  }
}
