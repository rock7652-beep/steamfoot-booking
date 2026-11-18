import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { availableGuides, findOperationGuides } from '../lib/operation-guide';
import type { GuideAccess } from '../lib/operation-guide-types';

const state = JSON.parse(readFileSync('docs/operation-guide-audit-state-20261030.json', 'utf8'));
describe('10/30 backend guide discovery and scope', () => {
  it('keeps LINE pause discoverable without requiring the LINE feature', () => {
    for (const moduleKind of ['steamfoot', 'course', 'beauty'] as const) {
      const access: GuideAccess = { module: moduleKind, permissions: ['business_hours.manage'], features: {} };
      expect(findOperationGuides('LINE 系統暫停', access).some(g => g.id === 'F14')).toBe(true);
      expect(availableGuides({ ...access, permissions: [] }).some(g => g.id === 'F14')).toBe(false);
    }
  });
  it('limits identity management and purchase recovery to their own permissions and modules', () => {
    const access: GuideAccess = { module: 'course', permissions: ['customer.identity.rebind', 'customer.read', 'customer.update'], features: {} };
    expect(findOperationGuides('LINE 同頁', access).some(g => g.id === 'LN01')).toBe(true);
    expect(availableGuides({ ...access, permissions: ['customer.read', 'customer.update'] }).some(g => g.id === 'LN01')).toBe(false);
    expect(availableGuides({ ...access, module: 'beauty' }).some(g => g.id === 'LN01')).toBe(false);
    const finance: GuideAccess = { module: 'beauty', permissions: ['transaction.create', 'wallet.create', 'customer.read'], features: {} };
    expect(findOperationGuides('查無紀錄 安全取消', finance).some(g => g.id === 'FIN02')).toBe(true);
    expect(availableGuides({ ...finance, permissions: ['transaction.create', 'customer.read'] }).some(g => g.id === 'FIN02')).toBe(false);
  });
  it('records the exact source baseline while retaining pending acceptance and retirement', () => {
    expect(state.lastInventoriedMainCommit).toBe('38ea7672aa670450ad3d2a6477aff54d9fc1b5ce');
    expect(state.newGuideIds).toEqual(['F14', 'LN01', 'C179', 'FIN02']);
    expect(state.updatedGuideIds).toHaveLength(19);
    expect(state.backendInteractionPendingCount).toBe(111);
    expect(state.authenticatedAcceptance.guideIdsCleared).toEqual([]);
    expect(state.frontendInteractionPendingGuideIds).toEqual([]);
  });
});
