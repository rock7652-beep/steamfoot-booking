import {PGlite} from "@electric-sql/pglite";
import {beforeEach,expect,it,vi} from "vitest";
import {readMusicTeachingItem,ensureMusicTeachingItem,musicTeachingQualifications,cardCoversTeachingItem,readTeachingTrialPrice,captureTeachingTuitionFees} from "@/server/services/music-teaching-item";
const tx={musicSubject:{findFirst:vi.fn()},courseTemplate:{findFirst:vi.fn(),findMany:vi.fn(),create:vi.fn(),update:vi.fn()}};
beforeEach(()=>{vi.resetAllMocks();tx.musicSubject.findFirst.mockResolvedValue({id:"guitar",name:"吉他",category:"弦樂",isActive:true});tx.courseTemplate.findFirst.mockResolvedValue(null);tx.courseTemplate.findMany.mockResolvedValue([]);});
it("previews a teaching item with no tuition plan and without writing",async()=>{
 const item=await readMusicTeachingItem(tx as never,"store","teaching:guitar");expect(item).toMatchObject({name:"吉他",musicTermLessons:null,musicPricePerLesson:null});expect(tx.courseTemplate.create).not.toHaveBeenCalled();expect(tx.musicSubject.findFirst).toHaveBeenCalledWith({where:{id:"guitar",storeId:"store",isActive:true}});
});
it("rejects unavailable or another store's subject",async()=>{tx.musicSubject.findFirst.mockResolvedValue(null);await expect(readMusicTeachingItem(tx as never,"store","teaching:guitar")).rejects.toThrow("本店啟用");});
it("creates a neutral scheduling identity that has no four/eight-lesson restriction",async()=>{
 await ensureMusicTeachingItem(tx as never,"store","teaching:guitar");expect(tx.courseTemplate.create).toHaveBeenCalledWith({data:expect.objectContaining({id:"teaching:guitar",musicSubjectId:"guitar",pointCost:1})});expect(tx.courseTemplate.create.mock.calls[0][0].data.musicTermLessons).toBeUndefined();expect(tx.courseTemplate.create.mock.calls[0][0].data.musicPricePerLesson).toBeUndefined();
});
it("keeps confirmed subject qualification valid across new tuition versions",async()=>{
 tx.courseTemplate.findMany.mockResolvedValue([{id:"four-lessons"},{id:"eight-lessons"}]);expect(await musicTeachingQualifications(tx as never,"store",{id:"teaching:guitar",musicSubjectId:"guitar"})).toEqual(["teaching:guitar","four-lessons","eight-lessons"]);
});
it("matches a person's own paid plan by subject while leaving the tuition identity intact",async()=>{
 tx.courseTemplate.findFirst.mockResolvedValue({id:"individual-800"});expect(await cardCoversTeachingItem(tx as never,"store","teaching:guitar",["individual-800"])).toBe(true);expect(tx.courseTemplate.findFirst).toHaveBeenCalledWith({where:{storeId:"store",id:{in:["individual-800"]},musicSubjectId:"guitar",musicTrialMode:null},select:{id:true}});tx.courseTemplate.findFirst.mockResolvedValue(null);expect(await cardCoversTeachingItem(tx as never,"store","teaching:piano",["individual-800"])).toBe(false);
});
it("quotes the trial tuition, never the regular tuition, and refuses conflicting trial prices",async()=>{
 tx.courseTemplate.findMany.mockResolvedValue([{musicTrialMode:"PAID",musicPricePerLesson:800,musicTeacherFeeBase:null}]);expect(await readTeachingTrialPrice(tx as never,"store","teaching-trial:guitar")).toMatchObject({musicPricePerLesson:800});expect(tx.courseTemplate.findMany.mock.calls[0][0].where.musicTrialMode).toEqual({in:["FREE","PAID"]});tx.courseTemplate.findMany.mockResolvedValue([{musicTrialMode:"PAID",musicPricePerLesson:800},{musicTrialMode:"PAID",musicPricePerLesson:900}]);await expect(readTeachingTrialPrice(tx as never,"store","teaching-trial:guitar")).rejects.toThrow("不同體驗學費");
});

it("captures existing tuition overrides only for the authorized store and selected lessons",async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE TABLE "CourseTemplate" (id text,"storeId" text,"musicSubjectId" text);CREATE TABLE "CourseSession" (id text,"storeId" text,"templateId" text,"coachId" text,"requestKey" text);CREATE TABLE "CourseCompensation" ("storeId" text,"templateId" text,"staffId" text,rules jsonb,revision int);CREATE TABLE "CourseCompensationSnapshot" ("sessionId" text,"storeId" text,rule jsonb,revision int);');
  await db.exec(`INSERT INTO "CourseTemplate" VALUES ('teaching:guitar','store','guitar'),('paid-guitar','store','guitar');INSERT INTO "CourseSession" VALUES ('new','store','teaching:guitar','teacher','series'),('old','store','teaching:guitar','teacher','series');INSERT INTO "CourseCompensation" VALUES ('store','paid-guitar','teacher','[{"mode":"CLASS","value":500}]',3);INSERT INTO "CourseCompensationSnapshot" VALUES ('new','store','{"mode":"UNSET"}',0),('old','store','{"mode":"SHARE","value":50}',1);`);
  const raw={$executeRaw:async(parts:TemplateStringsArray,...values:unknown[])=>{const sql=parts.reduce((text,part,index)=>text+part+(index<values.length?`$${index+1}`:""),"");return db.query(sql,values);}};
  await captureTeachingTuitionFees(raw as never,"store","series",["new"]);
  const rows=(await db.query<{sessionId:string;rule:{tuitionRules?:Record<string,{value:number}>}}>('SELECT "sessionId",rule FROM "CourseCompensationSnapshot" ORDER BY "sessionId"')).rows;
  expect(rows[0].rule.tuitionRules?.['paid-guitar'].value).toBe(500);expect(rows[1].rule.tuitionRules).toBeUndefined();
 }finally{await db.close();}
});
