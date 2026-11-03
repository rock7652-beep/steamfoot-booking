import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBeautyDatabaseUrl } from "@/lib/beauty-database-url";
import { buildDatabaseUrl } from "@/lib/database-url";
import { beautyDatabaseSelection } from "../../scripts/beauty-database-scope.mjs";
import { assertReviewedReleaseEnvironment } from "../../scripts/consultation-preview-scope.mjs";

const main = 'postgresql://beauty_1374_releaseapp:synthetic@127.0.0.1:32770/beauty_1374_releaseqa';
const dedicated = 'postgresql://steamfoot_beauty_data_qa:separate@127.0.0.1:32770/beauty_1374_releaseqa';
const env = {DATABASE_URL:main,DIRECT_URL:main,BEAUTY_DATABASE_MODE:'dedicated',BEAUTY_DATABASE_URL:dedicated};
const qa = {BEAUTY_RELEASE_QA:'1',NODE_ENV:'production',AUTH_URL:'http://localhost:3116',NEXTAUTH_URL:'http://localhost:3116',AUTH_SECRET:'synthetic',BEAUTY_MODULE_ENABLED:'1',BEAUTY_NOTIFICATIONS_ENABLED:'0'};
afterEach(()=>vi.unstubAllEnvs());
describe('Beauty dedicated connection selection',()=>{
 it('keeps legacy and main routing unchanged; never mutates main secret',()=>{
  vi.stubEnv('DATABASE_URL',main);vi.stubEnv('BEAUTY_DATABASE_MODE',undefined);vi.stubEnv('BEAUTY_DATABASE_URL',undefined);
  const legacy=buildBeautyDatabaseUrl();expect(legacy).toBe(buildDatabaseUrl());
  vi.stubEnv('BEAUTY_DATABASE_MODE','dedicated');vi.stubEnv('BEAUTY_DATABASE_URL',dedicated);
  expect(new URL(buildBeautyDatabaseUrl()).username).toBe('steamfoot_beauty_data_qa');
  expect(buildDatabaseUrl()).toBe(legacy);expect(process.env.DATABASE_URL).toBe(main);
 });
 it.each([undefined,'',main,'https://steamfoot_beauty_data_qa:secret@host/db',dedicated+'#x',dedicated+'?schema=other',dedicated+'?options=role%3Dpostgres',dedicated+'?connection_limit=1&connection_limit=2',dedicated+'?connection_limit=-1',dedicated.replace(':separate@','@'),dedicated.replace('/beauty_1374_releaseqa','/other'),dedicated+'\n'])('rejects invalid or missing URL without exposing its value (%#)',value=>{
  try {beautyDatabaseSelection({...env,BEAUTY_DATABASE_URL:value});throw Error('expected rejection');}
  catch(e){expect((e as Error).message).toBe('Dedicated Beauty database configuration is missing or invalid.');}
 });
 it.each(['','DEDICATED','typo'])('rejects unknown mode %s',mode=>expect(()=>beautyDatabaseSelection({...env,BEAUTY_DATABASE_MODE:mode})).toThrow('Invalid BEAUTY_DATABASE_MODE'));
 it('rejects orphan secret rather than silently using legacy',()=>expect(()=>beautyDatabaseSelection({...env,BEAUTY_DATABASE_MODE:'legacy'})).toThrow('requires dedicated'));
 it('Beauty misconfiguration does not change the existing main production guard',()=>{
  const mainScope={VERCEL:'1',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',BEAUTY_DATABASE_MODE:'dedicated'};
  expect(assertReviewedReleaseEnvironment(mainScope)).toBe('production');
  expect(()=>beautyDatabaseSelection(mainScope)).toThrow('missing or invalid');
 });
 it('requires TLS for remote dedicated endpoints',()=>expect(()=>beautyDatabaseSelection({...env,BEAUTY_DATABASE_URL:dedicated.replace('127.0.0.1','db.example.invalid')})).toThrow('invalid'));
 it('refuses unreviewed notification-worker activation',()=>expect(()=>beautyDatabaseSelection({...env,BEAUTY_NOTIFICATIONS_ENABLED:'1'})).toThrow('separately reviewed'));
 it('preserves explicit pool/TLS params and adds missing defaults',()=>{
  vi.stubEnv('DATABASE_URL',main);vi.stubEnv('BEAUTY_DATABASE_MODE','dedicated');
  vi.stubEnv('BEAUTY_DATABASE_URL','postgresql://steamfoot_beauty_data_qa.projectref:separate@aws-0.pooler.supabase.com:6543/beauty_1374_releaseqa?connection_limit=2&pool_timeout=7&sslmode=require&pgbouncer=true');
  const url=new URL(buildBeautyDatabaseUrl());
  expect(url.searchParams.get('connection_limit')).toBe('2');expect(url.searchParams.get('pool_timeout')).toBe('7');expect(url.searchParams.get('sslmode')).toBe('require');expect(url.searchParams.get('pgbouncer')).toBe('true');expect(url.searchParams.get('connect_timeout')).toBe('10');
 });
 it('accepts only exact local release QA dedicated endpoint',()=>expect(assertReviewedReleaseEnvironment({...env,...qa})).toBe('beauty-release-qa'));
 it.each([{BEAUTY_DATABASE_URL:dedicated.replace('127.0.0.1','remote.invalid')},{BEAUTY_DATABASE_URL:dedicated.replace('32770','32769')},{BEAUTY_DATABASE_URL:dedicated.replace('_qa:','_other:')},{BEAUTY_DATABASE_URL:dedicated+'?sslmode=require'},{VERCEL_ENV:'production'}])('cannot escape release isolation (%j)',patch=>expect(()=>assertReviewedReleaseEnvironment({...env,...qa,...patch})).toThrow());
 it.each([{VERCEL_ENV:'preview'},{BEAUTY_SANDBOX_QA:'1'},{BEAUTY_LOCAL_QA:'1'},{BEAUTY_PRODUCTION_QA:'1'},{SPORTS_LIVE_FLOW_QA:'1'}])('secondary secret cannot bypass existing preview scope (%j)',patch=>expect(()=>beautyDatabaseSelection({...env,...patch})).toThrow('not authorized'));
});
