import {afterEach, beforeEach, expect, it, vi} from "vitest";
const mocks=vi.hoisted(()=>({cards:vi.fn().mockResolvedValue([]),customer:vi.fn().mockResolvedValue({id:"source"})}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findFirst:mocks.customer,findMany:vi.fn().mockResolvedValue([])},storeFeatureEntitlement:{findFirst:vi.fn().mockResolvedValue({storeId:"store-lubymusic"})}}}));
vi.mock("@/server/services/course-access",()=>({courseManagerRead:vi.fn().mockResolvedValue({user:{role:"OWNER"},storeId:"store-lubymusic"})}));
vi.mock("@/lib/manager-visibility",()=>({getManagerCustomerWhere:()=>({storeId:"store-lubymusic"})}));
vi.mock("@/server/queries/course-members",()=>({getCourseCards:mocks.cards}));
import {browseCourseCards} from "@/server/actions/course-browse";
import {musicCardWhere,musicPlanWhere,LEGACY_MUSIC_PLAN_IDS} from "@/server/services/music-plan-scope";
const env={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feat/music-opening-state-20261007",VERCEL_GIT_REPO_OWNER:"rock7652-beep",VERCEL_GIT_REPO_SLUG:"steamfoot-booking",DATABASE_URL:"postgresql://postgres:test@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",DIRECT_URL:"postgresql://postgres:test@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",WORKERS_CI_BRANCH:"",CF_PAGES_BRANCH:""};
beforeEach(()=>{vi.clearAllMocks();for(const [k,v]of Object.entries(env))vi.stubEnv(k,v);});
afterEach(()=>vi.unstubAllEnvs());
it.each([undefined,"legacy"])("filters card pages and complete customer totals consistently (%s)",async dataScope=>{
 const r=await browseCourseCards({customerId:"source",page:2,dataScope});expect(r.success).toBe(true);
 expect(mocks.cards).toHaveBeenCalledTimes(2);
 const page=mocks.cards.mock.calls[0][2],totals=mocks.cards.mock.calls[1][2];
 expect(page.skip).toBe(40);expect(page.where.AND).toContainEqual(musicCardWhere("store-lubymusic",dataScope));
 expect(totals.where.AND).toContainEqual(musicCardWhere("store-lubymusic",dataScope));expect(totals.skip).toBe(0);
});
it("does not bypass classification for direct card detail",async()=>{
 await browseCourseCards({cardId:"legacy-card"});expect(mocks.cards.mock.calls[0][2].where).toMatchObject({id:"legacy-card",AND:[musicCardWhere("store-lubymusic")]});
});
it("requires a nonempty exclusively legacy membership and keeps general catalogs",()=>{
 const legacy=musicCardWhere("store-lubymusic","legacy");expect(legacy.members).toHaveProperty("some");expect(legacy.members).toHaveProperty("every");expect(musicCardWhere("store-lubymusic")).toEqual({NOT:legacy});
 expect(LEGACY_MUSIC_PLAN_IDS).toHaveLength(17);expect(LEGACY_MUSIC_PLAN_IDS).not.toContain("music-demo-plan-individual");expect(LEGACY_MUSIC_PLAN_IDS).not.toContain("yjy-pilot-plan-group8");
 expect(musicPlanWhere("store-lubymusic")).toEqual({id:{notIn:LEGACY_MUSIC_PLAN_IDS}});
});
it("does not classify production or other stores",()=>{expect(musicCardWhere("another","legacy")).toEqual({});vi.stubEnv("VERCEL_ENV","production");expect(musicCardWhere("store-lubymusic","legacy")).toEqual({});expect(musicPlanWhere("store-lubymusic")).toEqual({});});
