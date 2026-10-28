import { describe, expect, it } from 'vitest';
import { beautyPurchaseStatusLabel } from '@/lib/beauty/purchase-status';

describe('beauty purchase status', () => {
  it.each([
    ['PENDING', '待核帳'],
    ['CONFIRMED', '已核帳'],
    ['VOIDED', '已作廢'],
    ['unexpected', '狀態待確認'],
  ])('shows %s as %s', (status, expected) => {
    expect(beautyPurchaseStatusLabel(status)).toBe(expected);
  });
});
