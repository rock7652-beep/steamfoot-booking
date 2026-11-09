import { beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const m=vi.hoisted(()=>({trial:vi.fn(),context:vi.fn(),slug:vi.fn(),member:vi.fn()}));
vi.mock('next/navigation',()=>({notFound:()=>{throw Error('NOT_FOUND')}}));
vi.mock('@/lib/store-resolver',()=>({resolveCentralMemberLiffId:async()=> 'member-liff',resolveStoreSlugForLiff:m.slug}));
vi.mock('@/server/queries/liff-public-context',()=>({readLiffPublicContext:m.context}));
vi.mock('@/app/(liff)/liff/liff-shell',()=>({LiffShell:m.member}));
vi.mock('@/app/(liff)/liff/public-trial/page',()=>({default:m.trial}));
import Page from '@/app/(liff)/liff/page';
import { publicTrialPrimaryIntent } from '@/lib/liff/public-trial-intent';
beforeEach(()=>{vi.resetAllMocks();m.trial.mockResolvedValue(createElement('div',null,'trial bridge'));m.member.mockReturnValue(createElement('div',null,'member home'));m.slug.mockResolvedValue('silverlily');m.context.mockResolvedValue({store:{slug:'silverlily',name:'銀百合'},industry:{id:'course',customer:{}},healthEnabled:false})});
it('dispatches the actual decoded LINE primary state before mounting any member flow',async()=>{
 const url=new URL('https://example.test/s/silverlily/liff?liff.state=%2Fpublic-trial%3FbookingStore%3Dsilverlily');
 const result=await Page({searchParams:Promise.resolve({'liff.state':url.searchParams.get('liff.state')!})});
 expect(renderToStaticMarkup(result)).toContain('trial bridge');expect(m.member).not.toHaveBeenCalled();expect(m.context).not.toHaveBeenCalled();
 expect(await m.trial.mock.calls[0][0].searchParams).toEqual({bookingStore:'silverlily'});
});
it('leaves ordinary member entry and member deep links on their existing path',async()=>{
 for(const state of [undefined,'?courseView=bookings','/member-booking?session=example']){
  const result=await Page({searchParams:Promise.resolve({'liff.state':state})});expect(renderToStaticMarkup(result)).toContain('member home');
 }
 expect(m.trial).not.toHaveBeenCalled();expect(m.member).toHaveBeenCalledTimes(3);
});
it.each(['/public-trial','public-trial?bookingStore=silverlily','%2Fpublic-trial%3FbookingStore%3Dsilverlily'])('supports the public trial primary path %s',state=>{
 expect(publicTrialPrimaryIntent(state).kind).toBe('trial');
});
it.each(['//evil.example/public-trial','https://evil.example/public-trial','/public-trial?bookingStore=../other','/public-trial?bookingStore=a&bookingStore=b','/public-trial\\other','%2Fpublic-trial%ZZ'])('rejects malformed and ambiguous primary state %s',state=>{
 expect(publicTrialPrimaryIntent(state).kind).toBe('invalid');
});
it('rejects duplicate primary-state parameters instead of initializing a member session',async()=>{
 await expect(Page({searchParams:Promise.resolve({'liff.state':['/public-trial','/member-booking']})})).rejects.toThrow('NOT_FOUND');
 expect(m.member).not.toHaveBeenCalled();expect(m.trial).not.toHaveBeenCalled();
});
it('delegates shared-account store selection to the existing authorized trial resolver',async()=>{
 await Page({searchParams:Promise.resolve({'liff.state':'/public-trial?bookingStore=other'})});
 expect(await m.trial.mock.calls[0][0].searchParams).toEqual({bookingStore:'other'});
 expect(m.member).not.toHaveBeenCalled();
});
