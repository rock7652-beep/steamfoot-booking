export function waitlistGroups<T extends { groupKey: string; createdAt: Date; id: string }>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.groupKey) ?? [];
    group.push(row);
    groups.set(row.groupKey, group);
  }
  return [...groups.values()].sort((a, b) =>
    a[0].createdAt.getTime() - b[0].createdAt.getTime() || a[0].id.localeCompare(b[0].id),
  );
}

export function withinAutoPromoteWindow(startsAt: Date, stopMinutes: number, now = new Date()) {
  return startsAt.getTime() > now.getTime() + stopMinutes * 60_000;
}

export function promotableWaitlistGroups<T extends { groupKey: string; createdAt: Date; id: string }>(
  rows: T[],
  freeSeats: number,
): T[][] {
  const selected: T[][] = [];
  let remaining = Math.max(0, freeSeats);
  for (const group of waitlistGroups(rows)) {
    if (group.length > remaining) break;
    selected.push(group);
    remaining -= group.length;
    if (!remaining) break;
  }
  return selected;
}
