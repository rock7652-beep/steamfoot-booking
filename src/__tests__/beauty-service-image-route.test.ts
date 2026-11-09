import {beforeEach,it,expect,vi} from 'vitest';
const read=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{beautyServiceImage:{findUnique:read}}}));
vi.mock('next/server',()=>({NextResponse:class extends Response{}}));
import {GET} from '@/app/api/beauty/service-images/[id]/route';
beforeEach(()=>read.mockReset());
it('loads only thumbnail bytes for list requests and only full bytes after opening',async()=>{
 read.mockResolvedValueOnce({thumbnail:new Uint8Array([1,2])});
 const thumbnail=await GET(new Request('http://localhost/api/beauty/service-images/test'),{params:Promise.resolve({id:'test'})});
 expect(read).toHaveBeenLastCalledWith({where:{id:'test'},select:{thumbnail:true}});
 expect(thumbnail.headers.get('content-type')).toBe('image/webp');expect(thumbnail.headers.get('cache-control')).toContain('immutable');
 expect([...new Uint8Array(await thumbnail.arrayBuffer())]).toEqual([1,2]);
 read.mockResolvedValueOnce({content:new Uint8Array([3,4,5])});
 const full=await GET(new Request('http://localhost/api/beauty/service-images/test?size=full'),{params:Promise.resolve({id:'test'})});
 expect(read).toHaveBeenLastCalledWith({where:{id:'test'},select:{content:true}});expect(full.status).toBe(200);
});
it('rejects invalid IDs without accessing storage and returns 404 for missing images',async()=>{
 const invalid=await GET(new Request('http://localhost/api/beauty/service-images/x'),{params:Promise.resolve({id:'../secret'})});
 expect(invalid.status).toBe(404);expect(read).not.toHaveBeenCalled();read.mockResolvedValue(null);
 const missing=await GET(new Request('http://localhost/api/beauty/service-images/x'),{params:Promise.resolve({id:'missing'})});expect(missing.status).toBe(404);
});
