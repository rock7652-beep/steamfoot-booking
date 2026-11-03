/** Visible course customer filters share the Beauty field set. Preserve route scope. */
export function normalizeCourseCustomerFilters(source: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(source.toString());
  params.delete("visit");
  params.delete("referral");
  if (!["linked", "unlinked"].includes(params.get("status") ?? "")) params.delete("status");
  return params;
}
