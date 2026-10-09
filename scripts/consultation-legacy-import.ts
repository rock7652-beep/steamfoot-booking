#!/usr/bin/env node
/** Offline only. Never opens a database or sends the packet.
 * Usage: npx tsx scripts/consultation-legacy-import.ts --manifest /private/manifest.json
 *   --snapshot /private/snapshot.json --approval /private/approval.json
 *   --source-evidence /private/fresh-source.json [--packet-file /private/dry-run.json]
 * Apply packet additionally requires: --apply-packet --actor <approved-actor-id>
 * All private inputs and packet output must be owned, mode 0600 files in a mode
 * 0700 directory outside every Git worktree. The packet contains private content.
 * Flags are execution guards, not a replacement for the previously approved batch.
 */
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLegacyConsultationSqlPacket, type LegacySourceEvidence } from "../src/lib/consultation-legacy-sql-adapter";
import { type LegacyApproval } from "../src/lib/consultation-legacy-import";

const abort = (code: string): never => { throw new Error(`LEGACY_CLI_${code}`); };
function privateDirectory(path: string): string {
  if (!isAbsolute(path)) abort("ABSOLUTE_PRIVATE_PATH_REQUIRED");
  const dir = dirname(path);
  // Reject symlinked directory components, including a symlinked private leaf.
  if (realpathSync(dir) !== resolve(dir)) abort("SYMLINK_PATH_REFUSED");
  const stat = lstatSync(dir);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) abort("PRIVATE_DIRECTORY_REQUIRED");
  let cursor = dir;
  while (true) {
    const git = resolve(cursor, ".git");
    // Managed sandboxes expose empty reserved .git directories at writable
    // roots. A Git file (worktree) or a directory with HEAD is a repository.
    if (existsSync(git) && (!lstatSync(git).isDirectory() || existsSync(resolve(git, "HEAD")))) abort("REPOSITORY_PATH_REFUSED");
    const parent = dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
  return resolve(path);
}
export function readLegacyPrivateFile(path: string): string {
  const safe = privateDirectory(path);
  const fd = openSync(safe, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.() || stat.nlink !== 1) abort("PRIVATE_FILE_REQUIRED");
    if (stat.size > 10 * 1024 * 1024) abort("INPUT_TOO_LARGE");
    return readFileSync(fd, "utf8");
  } finally { closeSync(fd); }
}
export function writeLegacyPrivatePacket(path: string, packet: unknown): void {
  const safe = privateDirectory(path);
  // Exclusive creation prevents following links or overwriting an audit artifact.
  const fd = openSync(safe, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, `${JSON.stringify(packet, null, 2)}\n`, "utf8"); }
  finally { closeSync(fd); }
}
export function runLegacyPacketCli(argv: string[]): string {
  const values = new Map<string, string>(); let apply = false;
  const supported = new Set(["--manifest", "--snapshot", "--approval", "--source-evidence", "--packet-file", "--actor"]);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--apply-packet") { if (apply) abort("DUPLICATE_ARGUMENT"); apply = true; continue; }
    if (!supported.has(key) || values.has(key)) abort("UNKNOWN_OR_DUPLICATE_ARGUMENT");
    const value = argv[++i]; if (!value || value.startsWith("--")) abort("MISSING_ARGUMENT_VALUE");
    values.set(key, value);
  }
  const required = (key: string) => values.get(key) ?? abort("MISSING_REQUIRED_ARGUMENT");
  if (apply && !values.has("--packet-file")) abort("APPLY_REQUIRES_PRIVATE_PACKET_FILE");
  if (!apply && values.has("--actor")) abort("ACTOR_REQUIRES_APPLY_PACKET");
  const packet = buildLegacyConsultationSqlPacket({
    manifestText: readLegacyPrivateFile(required("--manifest")), snapshotText: readLegacyPrivateFile(required("--snapshot")),
    approval: JSON.parse(readLegacyPrivateFile(required("--approval"))) as LegacyApproval,
    sourceEvidence: JSON.parse(readLegacyPrivateFile(required("--source-evidence"))) as LegacySourceEvidence,
  }, apply ? { mode: "apply", explicitApply: true, actorId: required("--actor") } : {});
  const output = values.get("--packet-file");
  if (output) writeLegacyPrivatePacket(output, packet);
  // No private paths, source UUIDs, contact details, SQL, or raw errors on stdout.
  return JSON.stringify({ mode: packet.mode, target: packet.target, ...packet.summary,
    packetWritten: Boolean(output), querySha256: packet.querySha256, evidenceExpiresAt: packet.evidenceExpiresAt,
    destinationChecked: false });
}
const invokedPath = process.argv[1];
if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${runLegacyPacketCli(process.argv.slice(2))}\n`); }
  catch (error) {
    // Zod/filesystem/JSON messages can echo private input. Only our fixed codes are safe.
    const message = error instanceof Error && /^LEGACY_(?:SQL|CLI|IMPORT)_[A-Z_]+$/.test(error.message)
      ? error.message : "LEGACY_CLI_INPUT_OR_FILESYSTEM_REJECTED";
    process.stderr.write(`${message}\n`); process.exitCode = 1;
  }
}
