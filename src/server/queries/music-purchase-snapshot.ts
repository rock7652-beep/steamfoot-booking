import {measureMusicRead} from "@/lib/music-read-timing";
import "server-only";
import {musicReadTimingScope} from "@/lib/music-read-timing";
import {readMusicStudentWorkspace} from "./music-student-workspace";
import {readCourseCards} from "./course-card-browser";
import type {MusicPurchaseSnapshot} from "@/lib/music-purchase-snapshot";
import {loadMusicPeriods} from '@/server/actions/music-periods';
import {loadCourseCustomerPurchases} from '@/server/actions/course-customer-history';

/** Runs only after commit. Each projection retains its own read permissions and tenant scope. */
export async function readMusicPurchaseSnapshot(input: unknown): Promise<MusicPurchaseSnapshot | null> {
  if (!input || typeof input !== "object" || !("customerId" in input) || typeof input.customerId !== "string") return null;
  const customerId = input.customerId;
  try {
    if('musicSnapshotView' in input&&input.musicSnapshotView==='periods'){
      const [periods,purchases]=await Promise.all([loadMusicPeriods(customerId).catch(()=>null),loadCourseCustomerPurchases(customerId,0).catch(()=>null)]);
      return periods?.success||purchases?.success?{customerId,...(periods?.success?{periods}:{}),...(purchases?.success?{purchases}:{})}:null;
    }
    const [overview, cards,periods,purchases] = await Promise.all([
      musicReadTimingScope("overview",()=>measureMusicRead("total",()=>readMusicStudentWorkspace(customerId, true, undefined, false))),
      musicReadTimingScope("cards",()=>measureMusicRead("total",()=>readCourseCards({customerId}, true, undefined, true))),
      loadMusicPeriods(customerId).catch(()=>null),
      loadCourseCustomerPurchases(customerId,0).catch(()=>null),
    ]);
    // A failed/denied projection must never turn a committed purchase into a failed payment.
    return overview.success && cards.success ? {customerId, overview, cards,...(periods?.success?{periods}:{}),...(purchases?.success?{purchases}:{})} : null;
  } catch {
    return null;
  }
}
