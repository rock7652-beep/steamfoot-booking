import { prisma } from "@/lib/db";

export async function isSpaOperationalSchemaReady(): Promise<boolean> {
  try {
    const [result] = await prisma.$queryRaw<Array<{ ready: boolean }>>`
      SELECT
        (
          SELECT COUNT(*) = 6
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN (
              'ProfessionalSkill',
              'Treatment',
              'TreatmentSkill',
              'StaffSkill',
              'StaffWeeklyAvailability',
              'StaffAvailabilityException'
            )
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'Booking'
            AND column_name = 'treatmentServiceMinutesSnapshot'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'Booking'
            AND column_name = 'treatmentBufferMinutesSnapshot'
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
    const [result] = await prisma.$queryRaw<Array<{ ready: boolean }>>`
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
