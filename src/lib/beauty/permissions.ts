import type {PermissionCode} from '@/lib/permissions';
/** Only implemented beauty/shared capabilities; service technician grants live separately. */
export const BEAUTY_PERMISSIONS:readonly PermissionCode[]=[
 'customer.read','customer.create','customer.update','customer.assign','customer.export',
 'booking.read','booking.create','booking.update','wallet.read','wallet.create','wallet.adjust','plans.edit',
 'business_hours.view','business_hours.manage','report.read','report.export',
 'transaction.read','transaction.create','transaction.refund','transaction.void',
 'cashbook.read','cashbook.create','cashDrawer.read','cashDrawer.open','cashDrawer.close','cashDrawer.entry',
 'teacher.compensation.read','teacher.compensation.manage','teacher.settlement.read','teacher.settlement.confirm',
 'staff.view','staff.manage',
];
