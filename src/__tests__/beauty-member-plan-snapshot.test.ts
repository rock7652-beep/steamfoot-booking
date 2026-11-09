import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {AppError} from '@/lib/errors';
const m=vi.hoisted(()=>({member:vi.fn(),feature:vi.fn(),cards:vi.fn(),purchases:vi.fn(),held:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/server/beauty/access',()=>({beautyMember:m.member}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{beautyCard:{findMany:m.cards},beautyPurchase:{findMany:m.purchases},beautyAppointment:{groupBy:m.held}}}));
import {GET} from '@/app/api/beauty/member-plan-snapshot/route';
import {applicableCards} from '@/lib/beauty/member-booking';
const request=(slug='shop')=>new NextRequest(`http://localhost/api/beauty/member-plan-snapshot?store=${slug}`);
beforeEach(()=>{vi.clearAllMocks();m.member.mockResolvedValue({storeId:'store',customerId:'member',userId:'user',verifiedStore:{slug:'shop'}});m.feature.mockResolvedValue(undefined);m.cards.mockResolvedValue([{id:'card',name:'方案',remaining:5,expiresAt:new Date('2090-01-01'),closedAt:null,allowShared:true,serviceIds:['service']}]);m.purchases.mockResolvedValue([{id:'order',status:'PENDING',createdAt:new Date('2026-01-01')}]);m.held.mockResolvedValue([{cardId:'card',_count:{id:1}}]);});
describe('member-only plan snapshot',()=>{
 it('uses the authenticated member and current store and returns only visible plan status',async()=>{const response=await GET(request());expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');const data=await response.json();expect(data.data).toMatchObject({storeId:'store',customerId:'member',scopeKey:'user',cards:[{id:'card',remaining:5,held:1}],purchases:[{id:'order',status:'PENDING'}]});expect(m.cards).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:'store',memberIds:{has:'member'}}}));expect(m.purchases).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:'store',customerId:'member'},select:{id:true,status:true,createdAt:true}}));expect(JSON.stringify(data)).not.toContain('lastFour');});
 it('preserves sponsor-authorized shared-card eligibility without returning other member IDs',async()=>{const data=await (await GET(request())).json();const card=data.data.cards[0];expect(card.memberIds).toEqual(['member']);expect(applicableCards([card],'service','member','2026-10-29','10:00',true)).toHaveLength(1);expect(applicableCards([{...card,allowShared:false}],'service','member','2026-10-29','10:00',true)).toHaveLength(0);});
 it('rejects an altered store or unauthenticated identity before any query',async()=>{expect((await GET(request('other'))).status).toBe(403);m.member.mockRejectedValueOnce(new AppError('UNAUTHORIZED','login required'));expect((await GET(request())).status).toBe(403);expect(m.cards).not.toHaveBeenCalled();});
 it('treats an unavailable database as temporary failure and does not reveal error details',async()=>{m.cards.mockRejectedValueOnce(Error('secret database details'));const response=await GET(request());expect(response.status).toBe(503);const text=await response.text();expect(text).not.toContain('secret');expect(text).toContain('暫時無法更新');});
});
