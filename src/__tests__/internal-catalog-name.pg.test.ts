import {PGlite} from "@electric-sql/pglite";
import {afterEach,beforeEach,expect,it} from "vitest";
import type {Prisma} from "../../generated/course-client";
import {ensureMusicTeachingItem} from "@/server/services/music-teaching-item";
import {availableCourseTemplateName} from "@/server/services/internal-catalog-name";

let db:PGlite;
type Row={id:string;storeId:string;name:string;musicSubjectId:string;data:Record<string,unknown>};
type Where={storeId:string;id?:string|{not:string};name?:string;musicSubjectId?:string};
const unpack=(row:Row)=>({...row.data,id:row.id,storeId:row.storeId,name:row.name,musicSubjectId:row.musicSubjectId});
beforeEach(async()=>{
  db=new PGlite();
  await db.exec(`CREATE TABLE "MusicSubject"(id text PRIMARY KEY,"storeId" text,name text,category text DEFAULT '',description text DEFAULT '',"isActive" boolean DEFAULT true);
    CREATE TABLE "CourseTemplate"(id text PRIMARY KEY,"storeId" text,name text,"musicSubjectId" text,data jsonb DEFAULT '{}',UNIQUE("storeId",name));
    INSERT INTO "MusicSubject"(id,"storeId",name) VALUES('summer','music','暑期專班'),('foreign','other','暑期專班');`);
});
afterEach(async()=>{await db.close();});

// Only Prisma's transport is adapted; PostgreSQL enforces the actual unique
// constraint and the production teaching-item/name allocation services run.
function adapter(){
  return {
    musicSubject:{findFirst:async({where}:{where:Where})=>(await db.query('SELECT * FROM "MusicSubject" WHERE id=$1 AND "storeId"=$2',[where.id,where.storeId])).rows[0]??null},
    courseTemplate:{
      findFirst:async({where}:{where:Where})=>{
        const values:unknown[]=[where.storeId],conditions=['"storeId"=$1'];
        for(const key of ['id','name','musicSubjectId'] as const){
          const value=where[key];if(value===undefined)continue;
          values.push(typeof value==='object'?value.not:value);
          conditions.push(`"${key}"${typeof value==='object'?'<>':'='}$${values.length}`);
        }
        const row=(await db.query<Row>(`SELECT * FROM "CourseTemplate" WHERE ${conditions.join(' AND ')} ORDER BY id LIMIT 1`,values)).rows[0];
        return row?unpack(row):null;
      },
      findMany:async({where}:{where:Where})=>(await db.query<Row>('SELECT * FROM "CourseTemplate" WHERE "storeId"=$1 AND "musicSubjectId"=$2',[where.storeId,where.musicSubjectId])).rows.map(unpack),
      create:async({data}:{data:Record<string,unknown>})=>{
        const row=(await db.query<Row>('INSERT INTO "CourseTemplate"(id,"storeId",name,"musicSubjectId",data) VALUES($1,$2,$3,$4,$5) RETURNING *',[data.id,data.storeId,data.name,data.musicSubjectId,JSON.stringify(data)])).rows[0];
        return unpack(row);
      },
    },
  } as unknown as Prisma.TransactionClient;
}

it("regular and trial teaching identities coexist under a real unique constraint and retries keep both identities",async()=>{
  const tx=adapter();
  await ensureMusicTeachingItem(tx,'music','teaching:summer');
  await ensureMusicTeachingItem(tx,'music','teaching-trial:summer',500);
  await ensureMusicTeachingItem(tx,'music','teaching:summer');
  const rows=(await db.query<Row>('SELECT * FROM "CourseTemplate" ORDER BY name')).rows;
  expect(rows.map(r=>r.name)).toEqual(['教學項目：暑期專班','教學項目：暑期專班（2）']);
  expect(rows.map(r=>r.id).sort()).toEqual(['teaching-trial:summer','teaching:summer']);
  expect(rows.find(r=>r.id==='teaching-trial:summer')?.data).toMatchObject({musicPricePerLesson:500,musicTrialMode:'PAID'});
});

it("reusing a subject's former name creates a separate teaching identity and leaves the old schedule linked to its subject",async()=>{
  const tx=adapter();
  await ensureMusicTeachingItem(tx,'music','teaching:summer');
  await db.exec(`UPDATE "MusicSubject" SET name='寒期專班' WHERE id='summer'; INSERT INTO "MusicSubject"(id,"storeId",name) VALUES('new-summer','music','暑期專班');`);
  await ensureMusicTeachingItem(tx,'music','teaching:new-summer');
  const rows=(await db.query<Row>('SELECT * FROM "CourseTemplate" ORDER BY name')).rows;
  expect(rows.map(r=>({id:r.id,name:r.name,subject:r.musicSubjectId}))).toEqual([
    {id:'teaching:summer',name:'教學項目：暑期專班',subject:'summer'},
    {id:'teaching:new-summer',name:'教學項目：暑期專班（2）',subject:'new-summer'},
  ]);
});

it("checks inactive/legacy names too, excludes the renamed row, and never lets another store reserve a name",async()=>{
  await db.exec(`INSERT INTO "CourseTemplate"(id,"storeId",name) VALUES('a','music','內部排課'),('b','music','內部排課（2）'),('foreign','other','內部排課（3）');`);
  expect(await availableCourseTemplateName(adapter(),'music','內部排課')).toBe('內部排課（3）');
  expect(await availableCourseTemplateName(adapter(),'music','內部排課','a')).toBe('內部排課');
});
