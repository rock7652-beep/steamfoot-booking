import { expect, it } from "vitest";
import { coreFeatureForDashboardPath, coreFeatureForPermission } from "@/lib/core-feature-permissions";
it.each([['booking.create','basic_booking'],['customer.update','customer_management'],['wallet.create','plan_management'],['plans.edit','plan_management']])("guards %s with the same core module", (permission, feature) => {
  expect(coreFeatureForPermission(permission)).toBe(feature);
});
it.each(['/hq/dashboard/bookings/new','/s/a/admin/dashboard/bookings/123','/dashboard/spa-schedule'])("guards the direct booking route %s", path => expect(coreFeatureForDashboardPath(path)).toBe('basic_booking'));
it('does not conflate unrelated reports or HQ tooling with core permissions', () => {
 expect(coreFeatureForPermission('audit.read')).toBeUndefined();
 expect(coreFeatureForDashboardPath('/hq/dashboard/stores')).toBeUndefined();
});
