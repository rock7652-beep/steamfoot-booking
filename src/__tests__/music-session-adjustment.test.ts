import {expect,it,vi} from 'vitest';
vi.mock('@/server/services/music-native-workflow',()=>({musicNativeWorkflowEnabled:()=>false}));
import {manualMusicSlots,earliestMusicBackfill} from '@/server/services/music-session-adjustment';
import type {SessionAdjustmentRecord} from '@/lib/plan-session-adjustment';
const record:SessionAdjustmentRecord={id:'one',cardId:'card',customerId:'learner',customerName:'Learner',operation:'BACKFILL',quantity:1,occurredOn:'2026-01-02',reason:'',recordedAt:'2026-10-30T00:00:00Z',actorName:'Manager',reversalOf:null,remainingBefore:10,remainingAfter:9,slots:[{period:1,ordinal:1,bonus:false}]};
it('does not reuse manual slots and ignores slots of corrected records',()=>{
  expect(manualMusicSlots([record],'learner')).toEqual(record.slots);
  expect(manualMusicSlots([record,{...record,id:'reverse',operation:'REVERSE',reversalOf:'one'}],'learner')).toEqual([]);
  expect(manualMusicSlots([record],'other')).toEqual([]);
});
it('rejects legacy manual adjustments without verified period slots rather than guessing when fixed periods are enabled',()=>{
  expect(()=>manualMusicSlots([{...record,slots:[]}],'learner')).toThrow('期別尚未核對');
});
it('uses actual class dates, excluding voids and corrections, for first-use',()=>{
  expect(earliestMusicBackfill([record,{...record,id:'void',operation:'VOID',occurredOn:null}])?.toISOString()).toBe('2026-01-01T16:00:00.000Z');
  expect(earliestMusicBackfill([record,{...record,id:'reverse',operation:'REVERSE',reversalOf:'one'}])).toBeNull();
});
