import { describe,it,expect,vi } from "vitest";
vi.mock("server-only",()=>({}));
import type {Prisma} from "../../generated/course-client";
import {resolveMusicSubjectRule} from "@/server/services/music-subject-rule";
import {musicSubjectRuleSchema} from "@/lib/music-subject-rule";
const rule={subjectId:"guitar",classType:"PRIVATE" as const,musicPricePerLesson:800,musicTermLessons:4,musicValidityDaysPerTerm:35,musicScheduleMode:"FIXED" as const};
function db(subject:unknown,existing:unknown=null){return {musicSubject:{findFirst:vi.fn().mockResolvedValue(subject)},courseTemplate:{findFirst:vi.fn().mockResolvedValue(existing),create:vi.fn().mockImplementation(async({data})=>({id:"new-rule",...data})),update:vi.fn(),updateMany:vi.fn()}};}
describe("music subject rules",()=>{
 it("rejects a foreign or inactive subject without creating a rule",async()=>{const tx=db(null);await expect(resolveMusicSubjectRule(tx as unknown as Prisma.TransactionClient,"store-a",rule)).rejects.toThrow("本店上架");expect(tx.musicSubject.findFirst).toHaveBeenCalledWith({where:{id:"guitar",storeId:"store-a",isActive:true}});expect(tx.courseTemplate.create).not.toHaveBeenCalled();});
 it("reuses unchanged rules so existing qualifications and bookings remain connected",async()=>{const old={id:"old-rule",...rule};const tx=db({name:"木吉他"},old);expect(await resolveMusicSubjectRule(tx as unknown as Prisma.TransactionClient,"store-a",rule)).toBe(old);expect(tx.courseTemplate.create).not.toHaveBeenCalled();expect(tx.courseTemplate.update).not.toHaveBeenCalled();});
 it("adds group rules under the same subject without rewriting individual lessons",async()=>{const tx=db({name:"木吉他",category:"弦樂",description:""});const group={...rule,classType:"GROUP" as const,musicTermLessons:8,musicPricePerLesson:450};const result=await resolveMusicSubjectRule(tx as unknown as Prisma.TransactionClient,"store-a",group);expect(result).toMatchObject({musicSubjectId:"guitar",storeId:"store-a",classType:"GROUP",musicTermLessons:8,musicPricePerLesson:450});expect(tx.courseTemplate.update).not.toHaveBeenCalled();expect(tx.courseTemplate.updateMany).not.toHaveBeenCalled();});
 it.each([0,-1,1.5,1001])("rejects invalid lesson count %s",n=>expect(musicSubjectRuleSchema.safeParse({...rule,musicTermLessons:n}).success).toBe(false));
});
