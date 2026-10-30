import {loadSportsStaging} from "@/server/actions/sports-staging";

export const dynamic = "force-dynamic";
/** Same store/module/readiness and four grants as the former RSC loader. */
export async function GET() {
  const started = performance.now();
  const result = await loadSportsStaging(true);
  return Response.json(result,{headers:{"Cache-Control":"private, no-store","Vary":"Cookie","Server-Timing":`scheduleoptions;dur=${Math.round(performance.now()-started)}`}});
}
