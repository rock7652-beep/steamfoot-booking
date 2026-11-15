import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NextRequest,NextResponse} from 'next/server';
const m=vi.hoisted(()=>({store:vi.fn(),auth:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{store:{findUnique:m.store}}}));
vi.mock('@/lib/auth',()=>({auth:()=>m.auth}));
import {proxy} from '@/proxy';
async function read(path='/s/fixture/admin/dashboard/customers/summary-read',method='GET'){
 return proxy(new NextRequest(`https://example.test${path}`,{method}) as Parameters<typeof proxy>[0],{} as Parameters<typeof proxy>[1]);
}
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
beforeEach(()=>{vi.clearAllMocks();m.store.mockResolvedValue({industryModule:'STEAMFOOT'});m.auth.mockResolvedValue(NextResponse.next());vi.spyOn(console,'info').mockImplementation(()=>{});});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});

it.each(['summary-read','primary-read'])('starts authentication before the store lookup finishes for %s',async endpoint=>{
 let release!:(value:unknown)=>void;
 m.store.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const response=NextResponse.next({headers:{'X-Original':'preserved','Cache-Control':'private, no-store'}});
 response.cookies.set('session-fixture','same',{httpOnly:true});m.auth.mockResolvedValue(response);
 let settled=false;const result=read(`/s/fixture/admin/dashboard/customers/${endpoint}`);void result.then(()=>{settled=true;});
 await tick();expect(m.auth).toHaveBeenCalledOnce();expect(settled).toBe(false);
 release({industryModule:'STEAMFOOT'});
 expect(await result).toBe(response);expect(response.headers.get('X-Original')).toBe('preserved');
 expect(response.headers.get('Set-Cookie')).toContain('session-fixture=same');
});

it('overlaps independent delays without releasing an unchecked request',async()=>{
 vi.useFakeTimers();
 m.store.mockImplementation(()=>new Promise(resolve=>setTimeout(()=>resolve({industryModule:'STEAMFOOT'}),300)));
 m.auth.mockImplementation(()=>new Promise(resolve=>setTimeout(()=>resolve(NextResponse.next()),500)));
 const start=Date.now();let settled=false;const result=read();void result.then(()=>{settled=true;});
 await vi.advanceTimersByTimeAsync(499);expect(settled).toBe(false);
 await vi.advanceTimersByTimeAsync(1);await result;expect(Date.now()-start).toBe(500);
});

it('keeps the retired-store denial even when authentication fails first',async()=>{
 m.auth.mockRejectedValue(new Error('auth unavailable'));
 let release!:(value:unknown)=>void;m.store.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const result=read();await tick();expect(m.auth).toHaveBeenCalledOnce();
 release({industryModule:'SPA'});
 expect((await result)?.status).toBe(410);
});

it('consumes late authentication failure after returning a retired-store denial',async()=>{
 let reject!:(error:Error)=>void;m.auth.mockImplementation(()=>new Promise((_,no)=>{reject=no;}));
 m.store.mockResolvedValue({industryModule:'SPA'});
 expect((await read())?.status).toBe(410);expect(m.auth).toHaveBeenCalledOnce();
 reject(new Error('late failure'));await tick();
});

it('propagates store failure instead of using a successful authentication result',async()=>{
 m.store.mockRejectedValue(new Error('store unavailable'));
 await expect(read()).rejects.toThrow('store unavailable');expect(m.auth).toHaveBeenCalledOnce();
});

it.each([401,403,307])('preserves the authentication %s response after the store check',async status=>{
 const response=new NextResponse(null,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','Location':'/hq/login','Set-Cookie':'session-fixture=; Max-Age=0; HttpOnly'}});
 m.auth.mockResolvedValue(response);expect(await read()).toBe(response);
 expect(response.status).toBe(status);expect(response.headers.get('Vary')).toBe('Cookie');
 expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
});

it('propagates authentication failure when the store is allowed',async()=>{
 m.auth.mockRejectedValue(new Error('account unavailable'));
 await expect(read()).rejects.toThrow('account unavailable');
});

it.each([
 ['/s/fixture/admin/dashboard/customers','GET'],
 ['/s/fixture/admin/dashboard/customers/summary-read','POST'],
 ['/s/fixture/admin/dashboard/bookings','GET'],
])('keeps other paths serial: %s %s',async(path,method)=>{
 let release!:(value:unknown)=>void;m.store.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const result=read(path,method);await tick();expect(m.auth).not.toHaveBeenCalled();
 release({industryModule:'STEAMFOOT'});await result;expect(m.auth).toHaveBeenCalledOnce();
});
