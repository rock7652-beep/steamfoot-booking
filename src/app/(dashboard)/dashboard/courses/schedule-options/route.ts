import {loadSportsStaging} from "@/server/actions/sports-staging";

export const dynamic = "force-dynamic";
/** Same store/module/readiness and four grants as the former RSC loader. */
export async function GET() {
  const started = performance.now();
  // The native form selects learners directly. Pricing and balances have their
  // own authoritative readers and are not needed to open the form.
  const result = await loadSportsStaging(true, true);
  return Response.json(result,{headers:{"Cache-Control":"private, no-store","Vary":"Cookie","Server-Timing":`scheduleoptions;dur=${Math.round(performance.now()-started)}`}});
}
