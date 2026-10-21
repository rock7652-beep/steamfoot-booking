import {it,expect} from 'vitest';
import {assertBeautySandboxQaEnvironment,BEAUTY_SANDBOX_ORIGIN,beautySandboxRewriteUrl,beautySandboxSameOrigin} from '../../scripts/beauty-sandbox-qa-scope.mjs';
import {assertReviewedReleaseEnvironment} from '../../scripts/consultation-preview-scope.mjs';
const env={BEAUTY_SANDBOX_QA:'1',BEAUTY_SANDBOX_ORIGIN,AUTH_URL:BEAUTY_SANDBOX_ORIGIN,NEXTAUTH_URL:BEAUTY_SANDBOX_ORIGIN,NODE_ENV:'development',BEAUTY_MODULE_ENABLED:'1',BEAUTY_NOTIFICATIONS_ENABLED:'0',DATABASE_URL:'postgresql://beauty_1374_app:synthetic@127.0.0.1:32768/beauty_1374_qa',DIRECT_URL:'postgresql://beauty_1374_app:synthetic@127.0.0.1:32768/beauty_1374_qa'};
it('allows only the exact task Sandbox with the existing isolated database checks',()=>{expect(()=>assertBeautySandboxQaEnvironment(env)).not.toThrow();expect(assertReviewedReleaseEnvironment(env)).toBe('beauty-sandbox-qa');});
it('keeps existing deployment rewrite URLs intact',()=>{expect(beautySandboxRewriteUrl('/dashboard/beauty','https://example.com/s/qa/admin/dashboard/beauty','https',{}).href).toBe('https://example.com/dashboard/beauty');});
it('uses only the exact internal Sandbox host and preserves path/query',()=>{expect(beautySandboxRewriteUrl('/dashboard/beauty?tab=home',BEAUTY_SANDBOX_ORIGIN+'/s/qa/admin/dashboard/beauty','https',env).href).toBe('https://0.0.0.0:3000/dashboard/beauty?tab=home');expect(()=>beautySandboxRewriteUrl('/dashboard/beauty',BEAUTY_SANDBOX_ORIGIN,'https',{...env,DIRECT_URL:'postgresql://remote.invalid/production'})).toThrow();});
it.each([{VERCEL:'1'},{VERCEL_ENV:'production'},{WORKERS_CI_BRANCH:'main'},{NODE_ENV:'production'},{BEAUTY_NOTIFICATIONS_ENABLED:'1'},{AUTH_URL:'https://attacker.vercel.run'},{BEAUTY_SANDBOX_ORIGIN:'https://attacker.vercel.run'},{BEAUTY_LOCAL_QA:'1'},{DATABASE_URL:'postgresql://beauty_1374_app:synthetic@db.remote.invalid:32768/beauty_1374_qa'},{DIRECT_URL:'postgresql://postgres:synthetic@127.0.0.1:32768/beauty_1374_qa'}])('rejects unsafe Sandbox overrides %j',patch=>{expect(()=>assertReviewedReleaseEnvironment({...env,...patch})).toThrow();});
it('pins upload Origin to the isolated public host despite the internal TLS listener',()=>{
 for(const host of ['http://localhost:3000','https://0.0.0.0:3000',BEAUTY_SANDBOX_ORIGIN])expect(beautySandboxSameOrigin(host+'/api/image-announcements',BEAUTY_SANDBOX_ORIGIN,env)).toBe(true);
 for(const origin of [null,'https://attacker.invalid','http://localhost:3000'])expect(beautySandboxSameOrigin('http://localhost:3000/api/image-announcements',origin,env)).toBe(false);
 expect(beautySandboxSameOrigin('https://attacker.invalid/api',BEAUTY_SANDBOX_ORIGIN,env)).toBe(false);
 expect(()=>beautySandboxSameOrigin('http://localhost:3000/api',BEAUTY_SANDBOX_ORIGIN,{...env,NODE_ENV:'production'})).toThrow();
});
it('leaves normal upload origin checks strict without the QA flag',()=>{
 expect(beautySandboxSameOrigin('https://example.com/api','https://example.com',{})).toBe(true);
 expect(beautySandboxSameOrigin('http://localhost:3000/api',BEAUTY_SANDBOX_ORIGIN,{})).toBe(false);
 expect(beautySandboxSameOrigin('https://example.com/api',null,{})).toBe(false);
});
