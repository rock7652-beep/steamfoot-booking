import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {calculateCourseSaleAllocation,courseAllocationAfterRefund} from '@/lib/course-sale-allocation';
import {validateCourseTerm} from '@/server/services/course-term';
import type {Prisma} from '../../generated/course-client';
it.each([[2300,700,1600],[1800,700,1100],[2300,0,2300],[0,0,0]])('allocates actual paid %s with store cost %s',(paid,cost,profit)=>expect(calculateCourseSaleAllocation(paid,cost)).toEqual({storeAmount:cost,developerAmount:profit,shortfall:0}));
it('flags under-cost sales without negative developer income',()=>expect(calculateCourseSaleAllocation(100,700)).toEqual({storeAmount:100,developerAmount:0,shortfall:600}));
it('refund reversals keep original allocation and reverse cumulative rounding once',()=>{
 expect(courseAllocationAfterRefund(2300,700,2300)).toEqual({storeAmount:0,developerAmount:0});
 const a=courseAllocationAfterRefund(2300,700,1),b=courseAllocationAfterRefund(2300,700,2);
 expect(a.storeAmount+a.developerAmount).toBe(2299);expect(b.storeAmount+b.developerAmount).toBe(2298);
 expect(()=>courseAllocationAfterRefund(2300,700,2301)).toThrow();
});
const session=(id:string,date:string)=>({id,templateId:'course',startsAt:new Date(date+'T01:00:00Z'),endsAt:new Date(date+'T02:00:00Z')});
const query=vi.fn();const tx={courseSession:{findMany:query}} as unknown as Prisma.TransactionClient;
const plan={termSessionIds:['b','a'],templateIds:['course'],unit:'SESSION',points:2};
it('orders an exact full term by class time and scopes to store',async()=>{
 query.mockResolvedValue([session('a','2099-01-01'),session('b','2099-01-02')]);
 expect(await validateCourseTerm(tx,'A',plan)).toEqual(['a','b']);
 expect(query.mock.calls.at(-1)?.[0].where.storeId).toBe('A');
});
it('rejects missing, past, duplicate or overlapping term classes',async()=>{
 await expect(validateCourseTerm(tx,'A',{...plan,termSessionIds:['a','a']})).rejects.toThrow();
 query.mockResolvedValue([session('a','2099-01-01')]);await expect(validateCourseTerm(tx,'A',plan)).rejects.toThrow();
 query.mockResolvedValue([session('a','2020-01-01'),session('b','2099-01-02')]);await expect(validateCourseTerm(tx,'A',plan)).rejects.toThrow();
 query.mockResolvedValue([session('a','2099-01-01'),session('b','2099-01-01')]);await expect(validateCourseTerm(tx,'A',plan)).rejects.toThrow('重疊');
});
