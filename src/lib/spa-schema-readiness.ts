import { spaPrisma } from "@/lib/spa-db";

export async function isSpaOperationalSchemaReady(): Promise<boolean> {
  try {
    const [result] = await spaPrisma.$queryRaw<Array<{ ready: boolean }>>`
      SELECT
        (
          SELECT COUNT(*) = 14
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN (
              'SpaBooking', 'SpaBookingItem', 'SpaEntitlement',
              'SpaEntitlementUse', 'SpaPayment', 'SpaStoredValueWallet',
              'SpaStoredValueEntry', 'SpaTreatment', 'SpaSkill',
              'SpaTreatmentSkill', 'SpaStaffSkill', 'SpaStaffAvailability',
              'SpaStaffAvailabilityException', 'SpaStaffCompensation'
            )
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'SpaBooking'
            AND column_name = 'partyGroupId'
        ) AS ready
    `;
    return result?.ready === true;
  } catch (error) {
    console.error("[spa-schema] readiness check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function isSpaCompensationSchemaReady(): Promise<boolean> {
  try {
    const [result] = await spaPrisma.$queryRaw<Array<{ ready: boolean }>>`
      SELECT to_regclass('public."SpaStaffCompensation"') IS NOT NULL AS ready
    `;
    return result?.ready === true;
  } catch (error) {
    console.error("[spa-compensation-schema] readiness check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
