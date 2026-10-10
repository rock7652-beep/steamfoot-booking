import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { courseSettingsSectionSchema,type CourseSettingsSectionInput } from "@/lib/course-settings-sections";

export async function readCourseSettingsSection(tx:Prisma.TransactionClient,storeId:string,section:CourseSettingsSectionInput["section"]) {
  if(section==="booking") {
    const row=await tx.courseBookingRule.findUnique({where:{storeId}});
    return courseSettingsSectionSchema.parse({section,bookingLeadMinutes:row?.bookingLeadMinutes??0,cancellationLeadMinutes:row?.cancellationLeadMinutes??0});
  }
  const [row]=await tx.$queryRaw<Array<{name:string;address:string|null;shopPhone:string|null;mapUrl:string|null;lineOfficialId:string|null;lineOfficialUrl:string|null;bankName:string|null;bankCode:string|null;bankAccountNumber:string|null}>>`
    SELECT s.name,c.address,c."shopPhone",c."mapUrl",c."lineOfficialId",c."lineOfficialUrl",c."bankName",c."bankCode",c."bankAccountNumber"
    FROM "Store" s LEFT JOIN "ShopConfig" c ON c."storeId"=s.id WHERE s.id=${storeId}`;
  return courseSettingsSectionSchema.parse(section==="store"?{section,name:row.name,address:row.address??"",shopPhone:row.shopPhone??"",mapUrl:row.mapUrl??"",lineOfficialId:row.lineOfficialId??"",lineOfficialUrl:row.lineOfficialUrl??""}:{section,bankName:row.bankName??"",bankCode:row.bankCode??"",bankAccountNumber:row.bankAccountNumber??""});
}
