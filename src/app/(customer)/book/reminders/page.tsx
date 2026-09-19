import {courseMember} from "@/server/services/course-access";
import {coursePrisma} from "@/lib/course-db";
import {prisma} from "@/lib/db";
import Link from "next/link";
import {BalanceReminderPreference} from "./preference";
export default async function CourseReminderPreferencePage() {
  const {storeId,customer}=await courseMember();
  const [pref,store]=await Promise.all([
    coursePrisma.courseBalanceReminderPreference.findUnique({where:{storeId_customerId:{storeId,customerId:customer.id}}}),
    prisma.store.findUniqueOrThrow({where:{id:storeId},select:{name:true,slug:true}}),
  ]);
  return <main className="mx-auto w-full max-w-md space-y-4 p-4"><p className="text-sm text-earth-600">{store.name} · {customer.name}</p><BalanceReminderPreference initialStopped={!!pref?.stoppedAt}/><Link className="inline-flex min-h-11 items-center text-primary-700 underline" href={`/s/${encodeURIComponent(store.slug)}/book?view=plans`}>返回我的方案</Link></main>;
}
