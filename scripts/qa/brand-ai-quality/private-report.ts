// Run only in the owner's private machine/environment. No API or network.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { unseal } from "./shared-state";

try {
  const input = process.argv[2], output = process.argv[3];
  if (!input || !output || !process.env.AI_QUALITY_STATE_KEY)
    throw Error("PRIVATE_INPUT_AND_KEY_REQUIRED");
  const path = resolve(output), repo = resolve(dirname(process.argv[1]), "..", "..", "..");
  if (path === repo || path.startsWith(repo + sep)) throw Error("OUTPUT_MUST_BE_OUTSIDE_REPO");
  const state = unseal(readFileSync(input, "utf8"), process.env.AI_QUALITY_STATE_KEY,
    "rock7652-beep/steamfoot-booking:steamfoot-ai-quality:v1");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(state, null, 2), { mode: 0o600, flag: "wx" });
  console.log("PRIVATE_REPORT_SAVED_NO_MODEL_CALLS");
} catch {
  console.error("PRIVATE_REPORT_FAILED_NO_PRIVATE_DETAILS");
  process.exitCode = 1;
}
