import {expect,it,vi} from 'vitest';
import {createCustomerReadQueue} from '@/lib/customer-read-queue';
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
it('reserves foreground capacity and promotes the twentieth customer ahead of queued work',async()=>{
 const queue=createCustomerReadQueue(),started:string[]=[],finish=new Map<string,()=>void>();
 const run=(id:string)=>()=>new Promise<string>(resolve=>{started.push(id);finish.set(id,()=>resolve(id));});
 const pending=Array.from({length:20},(_,i)=>queue.read(String(i),run(String(i)),false));
 await tick();expect(started).toEqual(['0']);
 const clicked=queue.read('19',run('19'));expect(clicked).toBe(pending[19]);await tick();expect(started).toEqual(['0','19']);
 finish.get('19')!();await clicked;await tick();expect(started).toEqual(['0','19']);
 finish.get('0')!();await tick();expect(started).toEqual(['0','19','1']);
 for(let i=1;i<19;i++){finish.get(String(i))!();await tick();}await Promise.all(pending);expect(started).toHaveLength(20);
});
it('deduplicates an in-flight click, isolates a failure, and starts the next customer',async()=>{
 const queue=createCustomerReadQueue();let reject!:(error:Error)=>void;
 const run=vi.fn(()=>new Promise<void>((_,no)=>{reject=no;}));
 const first=queue.read('a',run,false),same=queue.read('a',run),next=queue.read('b',async()=>1,false);
 expect(same).toBe(first);const caught=first.catch(()=>null);await tick();reject(new Error('offline'));await caught;
 expect(await next).toBe(1);expect(run).toHaveBeenCalledOnce();expect(await queue.read('a',async()=>2)).toBe(2);
});
it('drops queued work on scope invalidation and keeps the cap for already delivered requests',async()=>{
 const queue=createCustomerReadQueue();let finish!:()=>void;
 const old=queue.read('a',()=>new Promise<void>(yes=>{finish=yes;}),false);
 const staleRun=vi.fn(async()=>1),stale=queue.read('b',staleRun,false).catch(e=>e.message);
 await tick();queue.clear();expect(await stale).toBe('讀取範圍已更新');expect(staleRun).not.toHaveBeenCalled();
 const fresh=vi.fn(async()=>2),pending=queue.read('b',fresh,false);await tick();expect(fresh).not.toHaveBeenCalled();
 finish();await old;expect(await pending).toBe(2);
});
it('pauses queued speculation on panel open without canceling a promoted click',async()=>{
 const queue=createCustomerReadQueue();let finish!:()=>void;
 const first=queue.read('a',()=>new Promise<void>(yes=>{finish=yes;}),false);
 const canceled=queue.read('b',async()=>1,false).catch(e=>e.message);queue.cancel('b');expect(await canceled).toBe('背景讀取已暫停');
 const clicked=queue.read('c',async()=>2,false);queue.read('c',async()=>3);queue.cancel('c');expect(await clicked).toBe(2);finish();await first;
});
