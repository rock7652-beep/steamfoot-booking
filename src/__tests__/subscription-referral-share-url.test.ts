// @vitest-environment jsdom
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {MySubscriptionReferralCode} from '@/components/subscription-referrals/my-code';
import {subscriptionReferralLink} from '@/lib/subscription-referral-code';
const code='SB-TESTABCD';
describe('subscription referral share URL',()=>{
 it.each([undefined,'https://steamfoot-referral-qa-20261105-example.vercel.app'])('renders a full matching URL in the page and LINE before hydration (%s)',shareOrigin=>{
  const html=renderToStaticMarkup(createElement(MySubscriptionReferralCode,{initialCode:code,shareOrigin,createAction:async()=>({success:true,message:''})}));
  const doc=new DOMParser().parseFromString(html,'text/html');
  const expected=`${shareOrigin??'https://www.steamfoot.com'}/apply?ref=${code}`;
  expect(doc.body.textContent).toContain(expected);
  const line=new URL(doc.querySelector('a')!.href);
  expect(line.origin).toBe('https://line.me');
  expect(line.searchParams.get('text')).toBe(`🎁 用我的推薦連結申請蒸管家，你和我都能額外獲得 30 天免費使用！\n\n讓預約、收款、顧客管理更輕鬆，一起少忙一點 😊\n\n點這裡申請 👇\n${expected}\n\n＊首次付費開通滿 30 天且未退款，核對後發放。`);
 });
 it.each(['http://example.com','https://example.com/path','https://user:pass@example.com','https://example.com?x=1'])('rejects invalid configured origins %s',origin=>expect(()=>subscriptionReferralLink(code,origin)).toThrow('推薦連結網址無效'));
});
