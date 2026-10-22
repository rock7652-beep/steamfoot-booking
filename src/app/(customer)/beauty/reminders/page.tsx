import Link from "next/link";
import {beautyMember} from "@/server/beauty/access";
import {prisma} from "@/lib/db";
import {beautyPlanPreferenceId,beautyPlanStopped} from "@/lib/beauty/reminders";
import {setBeautyPlanReminderPreference,setBeautyTrialCarePreference} from "@/server/actions/beauty-reminders";
import {BalanceReminderPreference} from "../../book/reminders/preference";
export default async function BeautyReminderPreferencePage() {
  const a=await beautyMember();
  const [plan,care]=await Promise.all([
    prisma.messageTemplate.findFirst({where:{storeId:a.storeId,id:beautyPlanPreferenceId(a.storeId,a.customerId!)},select:{body:true}}),
    prisma.trialCarePreference.findUnique({where:{storeId_customerId:{storeId:a.storeId,customerId:a.customerId!}}}),
  ]);
  return <main className="mx-auto w-full max-w-md space-y-4 p-4">
    <BalanceReminderPreference beauty initialStopped={beautyPlanStopped(plan?.body)} savePreference={setBeautyPlanReminderPreference}/>
    <BalanceReminderPreference trialCare initialStopped={!!care?.stoppedAt} savePreference={setBeautyTrialCarePreference}/>
    <Link className="inline-flex min-h-11 items-center text-primary-700 underline" href={`/s/${a.verifiedStore!.slug}/beauty?view=plans`}>返回我的方案</Link>
  </main>;
}
