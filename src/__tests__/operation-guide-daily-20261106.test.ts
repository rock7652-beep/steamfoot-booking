import { describe, expect, it } from 'vitest';
import { availableGuides, findOperationGuides, operationGuides } from '../lib/operation-guide';
import type { GuideAccess } from '../lib/operation-guide-types';
const store: GuideAccess = { module: 'steamfoot', permissions: ['staff.view', 'staff.manage', 'audit.read'], features: {} };
describe('backend referral guides', () => {
  it('keeps award instructions HQ-only across modules and HQ store views', () => {
    for (const moduleName of ['steamfoot', 'course', 'beauty'] as const) {
      const access = { ...store, module: moduleName };
      expect(availableGuides(access).some(g => g.id === 'REF02')).toBe(false);
      expect(findOperationGuides('推薦碼', access).some(g => g.id === 'REF01')).toBe(true);
      expect(findOperationGuides('免費期間不扣款', { ...access, hqScope: true }).some(g => g.id === 'REF02')).toBe(true);
      expect(availableGuides({ ...access, hqScope: true, permissions: ['audit.read'] }).some(g => g.id === 'REF02')).toBe(false);
    }
  });
  it('does not turn source review or guide visibility into feature activation or bank cancellation', () => {
    const owner = operationGuides.find(g => g.id === 'REF01')!;
    const hq = operationGuides.find(g => g.id === 'REF02')!;
    expect(owner.details.join(' ')).toContain('OWNER');
    expect(owner.details.join(' ')).toContain('資料就緒');
    expect(hq.steps.join(' ')).toContain('系統不會自動停止外部銀行扣款');
    expect(hq.steps.join(' ')).toContain('兩者較晚時間');
    expect(hq.steps.join(' ')).toContain('保留草稿');
    expect([owner, hq].every(g => g.verification === 'source-reviewed')).toBe(true);
    expect(availableGuides({ ...store, permissions: [] }).some(g => g.id.startsWith('REF'))).toBe(false);
  });
});
