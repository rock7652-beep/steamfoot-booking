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
  expect(line.searchParams.get('text')).toBe(`推薦你使用蒸管家：${expected}`);
 });
 it.each(['http://example.com','https://example.com/path','https://user:pass@example.com','https://example.com?x=1'])('rejects invalid configured origins %s',origin=>expect(()=>subscriptionReferralLink(code,origin)).toThrow('推薦連結網址無效'));
});
