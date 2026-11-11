import { courseMemberReturnPath } from "@/lib/course-delivery-links";
import type { IndustryModuleId } from "@/lib/industry-modules";

/** Presentation routing only; the destination still verifies membership and module. */
export function liffMemberPortalPath(module: IndustryModuleId, slug: string, search: string, bookingIntent = false): string | null {
  if (module === "course") return courseMemberReturnPath(slug, bookingIntent ? "?courseView=schedule" : search, true);
  if (module === "beauty") return `/s/${encodeURIComponent(slug)}/beauty${bookingIntent ? "?view=book" : ""}`;
  return null;
}
