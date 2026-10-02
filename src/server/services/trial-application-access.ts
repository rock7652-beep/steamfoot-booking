import { isPreview } from "@/lib/runtime-env";
// Preview may inherit production credentials. Only the existing isolated test
// project is permitted; never trust a caller-supplied environment label.
export function trialApplicationDatabaseAllowed() {
  if (!isPreview()) return true;
  try {
    const u = new URL(process.env.DATABASE_URL ?? "");
    const ref = "ttworfzgwejdeolegkxl";
    return (
      ["postgres:", "postgresql:"].includes(u.protocol) &&
      (u.hostname === `db.${ref}.supabase.co` ||
        (/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname) &&
          u.username === `postgres.${ref}`))
    );
  } catch {
    return false;
  }
}
const attempts = new Map<string, { count: number; until: number }>();
export function allowTrialRequest(key: string) {
  const now = Date.now();
  for (const [k, v] of attempts) {
    if (v.until < now) attempts.delete(k);
  }
  const value = attempts.get(key);
  if (value) {
    value.count++;
    return value.count <= 30;
  }
  if (attempts.size >= 10000) return false;
  attempts.set(key, { count: 1, until: now + 60_000 });
  return true;
}
