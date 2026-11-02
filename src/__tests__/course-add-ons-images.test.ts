import {it,expect,vi,afterEach} from 'vitest';
const m=vi.hoisted(()=>({image:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{serviceAddOnImage:{findFirst:m.image}}}));
import {GET} from '@/app/api/add-ons/images/[id]/route';
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
it('does not query images while every shared module is disabled',async()=>{
 vi.stubEnv('STEAMFOOT_ADD_ONS_ENABLED','0');vi.stubEnv('COURSE_ADD_ONS_ENABLED','0');
 expect((await GET(new Request('https://test/api/add-ons/images/img'),{params:Promise.resolve({id:'img'})})).status).toBe(404);
 expect(m.image).not.toHaveBeenCalled();
});
it.each([false,true])('serves only enabled course module images, full=%s',async full=>{
 vi.stubEnv('STEAMFOOT_ADD_ONS_ENABLED','0');vi.stubEnv('COURSE_ADD_ONS_ENABLED','1');
 m.image.mockResolvedValue(full?{content:new Uint8Array([1])}:{thumbnail:new Uint8Array([2])});
 const response=await GET(new Request('https://test/api/add-ons/images/img'+(full?'?size=full':'')),{params:Promise.resolve({id:'img'})});
 expect(response.status).toBe(200);expect(m.image).toHaveBeenCalledWith({where:{id:'img',module:{in:['FITNESS','MUSIC']}},select:full?{content:true}:{thumbnail:true}});
 expect(response.headers.get('Content-Type')).toBe('image/webp');
});
it('does not expose course images merely because Steamfoot is enabled',async()=>{
 vi.stubEnv('STEAMFOOT_ADD_ONS_ENABLED','1');vi.stubEnv('COURSE_ADD_ONS_ENABLED','0');m.image.mockResolvedValue(null);
 expect((await GET(new Request('https://test/api/add-ons/images/img'),{params:Promise.resolve({id:'img'})})).status).toBe(404);
 expect(m.image).toHaveBeenCalledWith(expect.objectContaining({where:{id:'img',module:{in:['STEAMFOOT']}}}));
});

it('serves Beauty shared goods images only when the Beauty module is enabled',async()=>{vi.stubEnv('STEAMFOOT_ADD_ONS_ENABLED','0');vi.stubEnv('COURSE_ADD_ONS_ENABLED','0');vi.stubEnv('BEAUTY_MODULE_ENABLED','1');m.image.mockResolvedValue({thumbnail:new Uint8Array([2])});expect((await GET(new Request('https://test/api/add-ons/images/img'),{params:Promise.resolve({id:'img'})})).status).toBe(200);expect(m.image).toHaveBeenCalledWith(expect.objectContaining({where:{id:'img',module:{in:['BEAUTY']}}}));});

vi.mock('@/lib/addons-db',async()=>({addonsPrisma:(await vi.importMock<{prisma:unknown}>('@/lib/db')).prisma}));
