import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({scope:vi.fn(),read:vi.fn()}));
vi.mock("@/server/services/music-data-scope",()=>({musicDataSeparationEnabled:m.scope}));
vi.mock("@/app/api/cashbook/quick/route",()=>({GET:m.read}));
import {GET} from "@/app/(dashboard)/dashboard/music-cashbook/route";
beforeEach(()=>vi.resetAllMocks());
it("fails closed outside the isolated preview",async()=>{m.scope.mockReturnValue(false);expect((await GET(new Request("https://test.test/dashboard/music-cashbook?storeId=store-lubymusic"))).status).toBe(403);expect(m.read).not.toHaveBeenCalled();});
it("preserves the original request and reader authorization",async()=>{m.scope.mockReturnValue(true);m.read.mockResolvedValue(new Response(null,{status:403}));const req=new Request("https://test.test/dashboard/music-cashbook?storeId=other");expect((await GET(req)).status).toBe(403);expect(m.read).toHaveBeenCalledExactlyOnceWith(req);});
