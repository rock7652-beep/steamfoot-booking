export function parseMemberBookingNextPeople(search: string): number | null {
  const params = new URLSearchParams(search);
  const people = Number(params.get("people"));

  if (
    !Number.isInteger(people) ||
    people < 1 ||
    people > 4
  ) {
    return null;
  }

  return people;
}

export function buildMemberBookingNextPath(
  storeSlug: string,
  people: number,
): string {
  const params = new URLSearchParams({ people: String(people) });
  return `/s/${storeSlug}/liff/member-booking?${params.toString()}`;
}
