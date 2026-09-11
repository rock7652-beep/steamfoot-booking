/** Resolve legacy customer anchors, including fragments retained during navigation. */
export function customerSectionId(hash: string): string | null {
  const target = hash.split("#").filter(Boolean).at(-1);
  if (target === "booking" || target === "new-booking") return "booking";
  if (target === "bookings") return "bookings";
  return null;
}
