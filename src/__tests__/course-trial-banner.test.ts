import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TrialProgressBar } from "@/components/feature-gate";
import type { TrialStatus } from "@/lib/shop-config";
import { getTrialRetention } from "@/lib/trial-retention";
const normal:TrialStatus={isFree:true,course:true,staff:{current:1,limit:3},daysRemaining:29,trialDays:30,trialExpired:false,customers:{current:1,limit:100,pct:1},bookings:{current:1,limit:100,pct:1},overallPct:3,stage:'normal',canCreateBooking:true,canCreateCustomer:true};
it('shows compact normal usage without warnings',()=>{const html=renderToStaticMarkup(React.createElement(TrialProgressBar,{trial:normal}));expect(html).toContain('體驗版用量');expect(html).toContain('本月預約');expect(html).toContain('啟用人員');expect(html).not.toContain('role="status"');expect(html).toContain('用量說明')});
it('paid store never renders trial quota',()=>expect(renderToStaticMarkup(React.createElement(TrialProgressBar,{trial:{...normal,isFree:false}}))).toBe(''));
it('explains expired and exceeded reasons without deleting usage',()=>{const html=renderToStaticMarkup(React.createElement(TrialProgressBar,{trial:{...normal,trialExpired:true,daysRemaining:0,bookings:{current:120,limit:100,pct:120}}}));expect(html).toContain('體驗已到期');expect(html).toContain('本月預約已達上限');expect(html).toContain('查看升級方案')});
it('retains the existing steamfoot and SPA presentation',()=>{const html=renderToStaticMarkup(React.createElement(TrialProgressBar,{trial:{...normal,course:false}}));expect(html).not.toContain('體驗版用量');expect(html).toContain('體驗期');});
it.each([['2026-10-30', '2026-10-30（含當日）'], ['2026-10-31', '資料待清理']])('shows retention boundary on %s', (today, text) => {
  const retention = getTrialRetention({plan:'EXPERIENCE',planStatus:'EXPIRED',planEffectiveAt:new Date('2026-09-01T00:00:00Z'),planExpiresAt:new Date('2026-09-30T00:00:00Z')}, today);
  const html = renderToStaticMarkup(React.createElement(TrialProgressBar,{trial:{...normal,trialExpired:true,retention}}));
  expect(html).toContain(text);
  expect(html).not.toContain('已刪除');
});
