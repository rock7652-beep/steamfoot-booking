// @vitest-environment jsdom
import {act,createElement as el} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({save:vi.fn(),complete:vi.fn(),report:vi.fn()}));
vi.mock('@/components/settings/save-settings-receipt',()=>({saveSettingsReceipt:m.save}));
vi.mock('@/server/actions/referral-share-template',()=>({updateReferralShareTemplate:vi.fn()}));
vi.mock('@/server/actions/referral-share-template-personalization',()=>({recordReferralTemplateUsageAction:vi.fn(),setReferralTemplateFavoriteAction:vi.fn()}));
import {ReferralShareSettingsForm} from '@/app/(dashboard)/dashboard/settings/referral-share/referral-share-form';
import {SettingsPanelContext} from '@/components/admin/settings-panel-context';
it('commits canonical returned text, clears dirty and completes once without a route refresh',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.save.mockResolvedValue({success:true,data:{referralShareTemplate:'新文案 {url}'}});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
 await act(async()=>root.render(el(SettingsPanelContext.Provider,{value:{report:m.report,navigate:vi.fn(),saved:m.complete}},el(ReferralShareSettingsForm,{storeId:'a',storeName:'測試',storeSlug:'a',initialTemplate:'原文案 {url}',initialFavoriteTemplateIds:[],initialRecent:[]}))));
 const textarea=host.querySelector('textarea')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,'  新文案 {url}  ');textarea.dispatchEvent(new Event('input',{bubbles:true}))});
 await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
 expect(m.save).toHaveBeenCalledOnce();expect(m.complete).toHaveBeenCalledOnce();expect(textarea.value).toBe('新文案 {url}');expect(m.report.mock.calls.at(-1)?.[1]).toEqual({dirty:false,pending:false});
 }finally{await act(async()=>root.unmount());host.remove()}
});
