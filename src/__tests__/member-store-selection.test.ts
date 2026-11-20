import {beforeEach,expect,it,vi} from 'vitest';
const find=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/db',()=>({prisma:{store:{findMany:find}}}));
import {getSelectableMemberMemberships} from '@/server/services/member-store-selection';
beforeEach(()=>vi.resetAllMocks());
it('preserves verified order and identities while excluding archived, inactive and paused stores',async()=>{
 const rows=[{storeId:'music',storeOperatingStatus:'TRIAL',customerId:'m'}, {storeId:'archived',storeOperatingStatus:'ACTIVE',customerId:'a'}, {storeId:'beauty',storeOperatingStatus:'ACTIVE',customerId:'b'}, {storeId:'paused',storeOperatingStatus:'PAUSED',customerId:'p'}, {storeId:'closed',storeOperatingStatus:'INACTIVE',customerId:'c'}];
 find.mockResolvedValue([{id:'beauty'},{id:'foreign'},{id:'music'}]);
 expect(await getSelectableMemberMemberships(rows)).toEqual([rows[0],rows[2]]);expect(rows).toHaveLength(5);
 expect(find).toHaveBeenCalledWith({where:{id:{in:['music','archived','beauty']},archivedAt:null,operatingStatus:{in:['ACTIVE','TRIAL']}},select:{id:true}});
});
it('does not query any stores when no eligible verified memberships exist',async()=>{
 expect(await getSelectableMemberMemberships([])).toEqual([]);expect(await getSelectableMemberMemberships([{storeId:'paused',storeOperatingStatus:'PAUSED'}])).toEqual([]);expect(find).not.toHaveBeenCalled();
});
it('does not turn a failed authoritative read into a successful empty list',async()=>{
 find.mockRejectedValue(new Error('read failed'));await expect(getSelectableMemberMemberships([{storeId:'active',storeOperatingStatus:'ACTIVE'}])).rejects.toThrow('read failed');
});
