import {expect,it} from 'vitest';
import {beautyCareCardMatches} from '@/lib/beauty/care';
const now=Date.parse('2026-10-22T04:00:00Z'),card={closedAt:null,expiresAt:'2026-11-01T04:00:00Z',remaining:2,held:0},plan={lowBalanceEnabled:true,lowBalanceThreshold:0};
it('includes an exhausted open card in an enabled zero-threshold reminder',()=>{expect(beautyCareCardMatches({...card,remaining:0},plan,now,'low')).toBe(true);});
it('uses available quantity after holds rather than the face balance',()=>{expect(beautyCareCardMatches({...card,held:2},plan,now,'low')).toBe(true);});
it('does not enable reminders without a store decision',()=>{expect(beautyCareCardMatches({...card,remaining:0},undefined,now,'low')).toBe(false);});
it('does not send a used-up card into expiration reminders',()=>{expect(beautyCareCardMatches({...card,remaining:0},plan,now,'expiring')).toBe(false);});
it.each([{...card,closedAt:'2026-10-20T00:00:00Z'},{...card,expiresAt:'2026-10-21T00:00:00Z'}])('excludes closed or expired cards',c=>{expect(beautyCareCardMatches(c,{...plan,lowBalanceThreshold:5},now,'low')).toBe(false);});
