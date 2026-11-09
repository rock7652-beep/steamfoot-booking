import { subscriptionReferralsReady } from "@/server/services/subscription-referral/runtime";
import { consultationDatabaseAllowed } from "@/server/services/consultation-lead-access";
export async function GET(){
  const enabled=consultationDatabaseAllowed()&&await subscriptionReferralsReady();
  return Response.json({enabled},{headers:{"Cache-Control":"no-store"}});
}
