import { afterEach, expect, it, vi } from "vitest";
const mock=vi.hoisted(()=>({authorize:vi.fn(),notFound:vi.fn(()=>{throw Error('NOT_FOUND');})}));
vi.mock('next/navigation',()=>({notFound:mock.notFound}));
vi.mock('@/server/services/frontend-preview',()=>({authorizeFrontendPreview:mock.authorize}));
vi.mock('@/app/course-portal-acceptance/preview-frame',()=>({CoursePortalAcceptanceFrame:()=>null}));
import Page from '@/app/course-portal-acceptance/page';
const valid={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feat/customer-course-portal-simplify-20261009',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:'postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres',DIRECT_URL:'postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres'};
const params=()=>({searchParams:Promise.resolve({storeId:'test-store',personId:'test-member',role:'member'})});
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it.each(['production','development'])('does not expose the measurement page in %s',async env=>{
  vi.stubEnv('VERCEL_ENV',env);
  await expect(Page(params())).rejects.toThrow('NOT_FOUND');expect(mock.authorize).not.toHaveBeenCalled();
});
it('rejects unknown branches and unsafe connections before member reads',async()=>{
  for(const [key,value] of Object.entries(valid))vi.stubEnv(key,value);
  vi.stubEnv('VERCEL_GIT_COMMIT_REF','other');await expect(Page(params())).rejects.toThrow('NOT_FOUND');
  vi.stubEnv('VERCEL_GIT_COMMIT_REF',valid.VERCEL_GIT_COMMIT_REF);vi.stubEnv('DIRECT_URL','postgresql://postgres:synthetic@production.invalid/postgres');
  await expect(Page(params())).rejects.toThrow('isolated database');expect(mock.authorize).not.toHaveBeenCalled();
});
it('preserves the existing preview authorization and never impersonates a customer',async()=>{
  for(const [key,value] of Object.entries(valid))vi.stubEnv(key,value);
  mock.authorize.mockRejectedValueOnce(Error('FORBIDDEN'));await expect(Page(params())).rejects.toThrow('FORBIDDEN');
  mock.authorize.mockResolvedValueOnce({moduleId:'course',storeId:'test-store',personId:'test-member'});
  const page=await Page(params());expect(page.props.src).toBe('/frontend-preview?storeId=test-store&personId=test-member&role=member');
  expect(mock.authorize).toHaveBeenLastCalledWith({storeId:'test-store',personId:'test-member',role:'member'});
});
