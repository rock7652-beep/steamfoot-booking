import { describe, expect, it } from 'vitest';
import { availableGuides, findOperationGuides } from '../lib/operation-guide';
import type { GuideAccess } from '../lib/operation-guide-types';

describe('Beauty journey, collection and hours guide discovery', () => {
  const access: GuideAccess = {module: 'beauty', permissions: ['booking.create', 'customer.read', 'booking.read', 'transaction.create', 'business_hours.manage'], features: {transaction_management: true}};
  it('finds the backend tasks with their visible control names', () => {
    for (const [query, id] of [['合併其他服務', 'BEAUTY11'], ['混合付款', 'BEAUTY12'], ['管理時段 當日開放', 'BEAUTY13']]) {
      expect(findOperationGuides(query, access).some(g => g.id === id)).toBe(true);
    }
  });
  it('keeps module, write permission and transaction feature boundaries', () => {
    expect(availableGuides({...access, module: 'course'}).some(g => ['BEAUTY11', 'BEAUTY12', 'BEAUTY13'].includes(g.id))).toBe(false);
    expect(availableGuides({...access, permissions: ['booking.read']}).some(g => ['BEAUTY11', 'BEAUTY12', 'BEAUTY13'].includes(g.id))).toBe(false);
    expect(availableGuides({...access, features: {}}).some(g => g.id === 'BEAUTY12')).toBe(false);
    expect(availableGuides({...access, permissions: access.permissions.filter(p => p !== 'customer.read')}).some(g => g.id === 'BEAUTY11')).toBe(false);
  });
});
