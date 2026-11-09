import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({transaction:vi.fn(),execute:vi.fn()}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{$transaction:m.transaction}}));
import {beautyReadTransaction} from '@/server/beauty/read-transaction';
it('uses a read-only repeatable snapshot without a Store lock',async()=>{
 const tx={$executeRaw:m.execute};m.transaction.mockImplementation(async(work)=>work(tx));
 const work=vi.fn(async()=>({due:200}));expect(await beautyReadTransaction(work)).toEqual({due:200});
 expect(m.transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'RepeatableRead',timeout:20000});
 expect(m.execute.mock.calls[0][0].join('')).toBe('SET TRANSACTION READ ONLY');expect(work).toHaveBeenCalledWith(tx);
});
it('does not run the read if readonly transaction setup fails',async()=>{
 m.execute.mockRejectedValueOnce(Error('readonly unavailable'));const read=vi.fn();await expect(beautyReadTransaction(read)).rejects.toThrow('readonly unavailable');expect(read).not.toHaveBeenCalled();
});
