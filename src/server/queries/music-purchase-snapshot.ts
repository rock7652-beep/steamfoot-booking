import "server-only";
import {readMusicStudentWorkspace} from "./music-student-workspace";
import {readCourseCards} from "./course-card-browser";
import type {MusicPurchaseSnapshot} from "@/lib/music-purchase-snapshot";

/** Runs only after commit. Each projection retains its own read permissions and tenant scope. */
export async function readMusicPurchaseSnapshot(input: unknown): Promise<MusicPurchaseSnapshot | null> {
  if (!input || typeof input !== "object" || !("customerId" in input) || typeof input.customerId !== "string") return null;
  const customerId = input.customerId;
  try {
    const [overview, cards] = await Promise.all([
      readMusicStudentWorkspace(customerId, true, undefined, false),
      readCourseCards({customerId}, true, undefined, true),
    ]);
    // A failed/denied projection must never turn a committed purchase into a failed payment.
    return overview.success && cards.success ? {customerId, overview, cards} : null;
  } catch {
    return null;
  }
}
