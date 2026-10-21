import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {z} from "zod";
vi.mock("server-only",()=>({}));
import {settingsSavePOST} from "@/server/services/settings-save-route";
import {BEAUTY_SANDBOX_ORIGIN as origin} from "../../scripts/beauty-sandbox-qa-scope.mjs";
const env={BEAUTY_SANDBOX_QA:"1",BEAUTY_SANDBOX_ORIGIN:origin,AUTH_URL:origin,NEXTAUTH_URL:origin,NODE_ENV:"development",BEAUTY_MODULE_ENABLED:"1",BEAUTY_NOTIFICATIONS_ENABLED:"0",DATABASE_URL:"postgresql://beauty_1374_app:synthetic@127.0.0.1:32768/beauty_1374_qa",DIRECT_URL:"postgresql://beauty_1374_app:synthetic@127.0.0.1:32768/beauty_1374_qa"};
beforeEach(()=>{for(const [k,v] of Object.entries(env))vi.stubEnv(k,v);});
afterEach(()=>vi.unstubAllEnvs());
function request(url:string,from:string|null){return new Request(url,{method:"POST",headers:{"content-type":"application/json",...(from?{origin:from}:{})},body:JSON.stringify({value:"test"})});}
it("allows the real pinned Sandbox browser through the internal listener",async()=>{
 const save=vi.fn(async()=>({success:true})),post=settingsSavePOST(z.object({value:z.string()}),save);
 expect((await post(request("https://0.0.0.0:3000/api/settings/save",origin))).status).toBe(200);
 expect(save).toHaveBeenCalledWith({value:"test"});
});
it("rejects forged or missing Origins before invoking the settings writer",async()=>{
 const save=vi.fn(),post=settingsSavePOST(z.object({value:z.string()}),save);
 for(const from of [null,"https://attacker.invalid","http://localhost:3000"])expect((await post(request("http://localhost:3000/api/settings/save",from))).status).toBe(403);
 expect(save).not.toHaveBeenCalled();
});
it("keeps strict same-origin behavior outside the isolated QA scope",async()=>{
 vi.stubEnv("BEAUTY_SANDBOX_QA","");const save=vi.fn(async()=>({success:true})),post=settingsSavePOST(z.object({value:z.string()}),save);
 expect((await post(request("https://example.test/api/settings/save",origin))).status).toBe(403);
 expect((await post(request("https://example.test/api/settings/save","https://example.test"))).status).toBe(200);
 expect(save).toHaveBeenCalledTimes(1);
});
it("cannot use the QA exception with a production environment",async()=>{
 vi.stubEnv("NODE_ENV","production");const save=vi.fn(),post=settingsSavePOST(z.object({value:z.string()}),save);
 await expect(post(request("http://localhost:3000/api/settings/save",origin))).rejects.toThrow(/development/);expect(save).not.toHaveBeenCalled();
});
