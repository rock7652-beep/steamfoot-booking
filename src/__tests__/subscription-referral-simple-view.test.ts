import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
vi.mock('@/components/desktop',()=>({PageShell:({children}:{children:React.ReactNode})=>React.createElement('main',null,children),PageHeader:({title,subtitle}:{title:string;subtitle:string})=>React.createElement('header',null,React.createElement('h1',null,title),React.createElement('p',null,subtitle))}));
import {HqSubscriptionReferralView,type Reward,type Row} from '@/components/subscription-referrals/hq-view';
const row:Row={id:'r',code:'SB-ABCDEFGH',referrerStoreId:'a',referredStoreId:'b',referrerName:'推薦人',referredName:'朋友',receiptRef:'QA-RECEIPT',settledAt:new Date('2026-10-01'),paidSubscriptionId:'sub-b'};
const rewards:Reward[]=['a','b'].map((id,i)=>({id:'w-'+id,referralId:'r',beneficiaryStoreId:id,storeName:i?'朋友':'推薦人',state:'READY',days:30,expiresAt:new Date('2099-11-20'),newExpiresOn:null,planStatus:i?'ACTIVE':'TRIAL',subscriptionStatus:i?'ACTIVE':'TRIAL',archivedAt:null,billingCycle:i?'MONTHLY':null,isTrial:!i}));
const action=async()=>({success:true,message:'done'});
function html(items=rewards,current=row){return renderToStaticMarkup(React.createElement(HqSubscriptionReferralView,{leads:[],rows:[current],stores:[],subs:[],rewards:items,page:1,storeQuery:'',hasNext:false,actions:{bind:action,verify:action,apply:action}}));}
describe('simple referral award screen',()=>{
 it('shows one award button for the exact pair and monthly fields only for the monthly account',()=>{
  const view=html();expect(view.match(/>確認發放雙方各 30 天</g)).toHaveLength(1);
  expect(view).toContain('name="referredBillingReference"');expect(view).not.toContain('name="referrerBillingReference"');expect(view).toContain('免費期間不扣款');expect(view).toContain('可以發放');
 });
 it('does not ask annual and trial accounts to complete monthly paperwork',()=>{
  const view=html(rewards.map(w=>({...w,billingCycle:'YEARLY'})));expect(view).not.toContain('扣款安排紀錄');expect(view).toContain('確認發放雙方各 30 天');
 });
 it('shows completion without another award button; holds inactive accounts and refunded orders',()=>{
  expect(html(rewards.map(w=>({...w,state:'APPLIED',newExpiresOn:new Date('2099-12-20')})))).not.toContain('>確認發放雙方各 30 天<');
  const held=html(rewards.map(w=>({...w,planStatus:'EXPIRED'})));expect(held).toContain('獎勵已保留');expect(held).not.toContain('>確認發放雙方各 30 天<');
  expect(html(rewards,{...row,refunded:true})).not.toContain('>確認發放雙方各 30 天<');
 });
});
