import { z } from "zod";
import { settingsSavePOST } from "@/server/services/settings-save-route";
import { setManagerNotificationPreference, setStoreLineNotificationRecipientActive } from "@/server/actions/store-line-notification-recipients";
import { MANAGER_NOTIFICATION_OPTIONS } from "@/lib/manager-notification-preferences";

const schema = z.object({
  expectedStoreId: z.string().min(1),
  id: z.string().min(1),
  key: z.enum(["active", ...MANAGER_NOTIFICATION_OPTIONS.map(option => option.key)] as [string, ...string[]]),
  enabled: z.boolean(),
}).strict();

/** Same authorization and row locks as actions; JSON avoids action queue and RSC rendering. */
export const POST = settingsSavePOST(schema, async input => {
  const { id, key, enabled, expectedStoreId } = input;
  const result = key === "active"
    ? await setStoreLineNotificationRecipientActive(id, enabled, expectedStoreId)
    : await setManagerNotificationPreference(id, key, enabled, expectedStoreId);
  return result.success
    ? { success: true, data: { id, key, enabled }, storeId: expectedStoreId }
    : result;
});
