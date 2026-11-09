import {afterEach,expect,it,vi} from "vitest";
vi.mock("@/lib/db",()=>({prisma:{}}));
import {assertSportsRedesignPreviewEnvironment,MIXED_ENROLLMENT_PREVIEW_BRANCH} from "../../scripts/sports-redesign-preview-scope.mjs";
import {assertReviewedReleaseEnvironment} from "../../scripts/consultation-preview-scope.mjs";
import {musicNativeWorkflowEnabled} from "../../scripts/music-native-workflow-scope.mjs";
import {sportsStagingEnabled} from "@/lib/sports-staging";
const connection="postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co/postgres?sslmode=require";
const env={VERCEL:"1",VERCEL_ENV:"preview",NODE_ENV:"production",VERCEL_PROJECT_ID:"prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR",VERCEL_GIT_COMMIT_REF:MIXED_ENROLLMENT_PREVIEW_BRANCH,VERCEL_GIT_REPO_OWNER:"rock7652-beep",VERCEL_GIT_REPO_SLUG:"steamfoot-booking",COURSE_MIXED_ENROLLMENT_PREVIEW:"1",SPORTS_REDESIGN_STAGING:"1",SPORTS_REDESIGN_PREVIEW:"1",DATABASE_URL:connection,DIRECT_URL:connection};
afterEach(()=>vi.unstubAllEnvs());
it("uses the existing migration-free Preview mode only for the exact isolated project",()=>{
 expect(()=>assertSportsRedesignPreviewEnvironment(env)).not.toThrow();
 expect(assertReviewedReleaseEnvironment(env)).toBe("sports-redesign-preview");
});
it.each([
 {VERCEL_ENV:"production"},{VERCEL_PROJECT_ID:"different-project"},{COURSE_MIXED_ENROLLMENT_PREVIEW:""},
 {DATABASE_URL:connection.replace("ttworfzgwejdeolegkxl","qijlnhtpbintanzpxkvf")},{DIRECT_URL:connection.replace("ttworfzgwejdeolegkxl","qijlnhtpbintanzpxkvf")},
 {SPORTS_REDESIGN_STAGING:""},{SPORTS_REDESIGN_PREVIEW:""},{VERCEL_GIT_REPO_SLUG:"other"},{WORKERS_CI_BRANCH:"main"},
 {LINE_CHANNEL_ACCESS_TOKEN:"synthetic"},{STEAM_BUTLER_LINE_CHANNEL_ACCESS_TOKEN:"synthetic"},{RESEND_API_KEY:"synthetic"},{STORE_LINE_ADDITIONAL_CONFIG_JSON:"synthetic"},
 {PRODUCTION_MIGRATION_TARGET:"synthetic"},
])("rejects unsafe Preview configuration before building: %j",patch=>{
 expect(()=>assertSportsRedesignPreviewEnvironment({...env,...patch})).toThrow();
 expect(musicNativeWorkflowEnabled("store-lubymusic",{...env,...patch})).toBe(false);
});
it("does not enable music workflow for unrelated stores",()=>{
 expect(musicNativeWorkflowEnabled("store-lubymusic",env)).toBe(true);
 expect(musicNativeWorkflowEnabled("other",env)).toBe(false);
});
it("limits sports capability to the existing synthetic sports store",async()=>{
 for(const [key,value]of Object.entries(env))vi.stubEnv(key,value);
 expect(await sportsStagingEnabled("sports-live-flow-store")).toBe(true);
 expect(await sportsStagingEnabled("store-lubymusic")).toBe(false);
 expect(await sportsStagingEnabled("another-store")).toBe(false);
});
