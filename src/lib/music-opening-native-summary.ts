/** Project actual native leave chains; reserved attempts remain outstanding. */
export function summarizeNativeMakeupSources(rows: readonly {
  id: string; makeupForBookingId: string | null; status: string; absenceKind: string | null;
}[], sourceIds: readonly string[]) {
  const byId = new Map(rows.map(row => [row.id, row]));
  if (byId.size !== rows.length || new Set(sourceIds).size !== sourceIds.length) throw new Error("DUPLICATE_NATIVE_SOURCE");
  const results = sourceIds.map(sourceId => {
    const root = byId.get(sourceId);
    if (!root || root.makeupForBookingId || root.status !== "CANCELLED" || root.absenceKind !== "STUDENT_LEAVE") throw new Error("INVALID_NATIVE_SOURCE");
    const seen = new Set<string>(); let current = root;
    for (;;) {
      if (seen.has(current.id)) throw new Error("CYCLIC_NATIVE_MAKEUP");
      seen.add(current.id);
      const children = rows.filter(row => row.makeupForBookingId === current.id && (row.status !== "CANCELLED" || row.absenceKind === "STUDENT_LEAVE"));
      if (children.length > 1) throw new Error("AMBIGUOUS_NATIVE_MAKEUP");
      if (!children.length) return { sourceId, state: "AVAILABLE" as const };
      const child = children[0];
      if (child.status === "ATTENDED") return { sourceId, state: "REDEEMED" as const };
      if (child.status === "RESERVED") return { sourceId, state: "RESERVED" as const };
      if (child.status !== "CANCELLED" || child.absenceKind !== "STUDENT_LEAVE") throw new Error("UNVERIFIED_NATIVE_MAKEUP_STATUS");
      current = child;
    }
  });
  const redeemed = results.filter(row => row.state === "REDEEMED").length;
  const reserved = results.filter(row => row.state === "RESERVED").length;
  return { results, issued: sourceIds.length, redeemed, reserved, outstanding: sourceIds.length - redeemed, unreserved: sourceIds.length - redeemed - reserved };
}
