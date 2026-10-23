/** JSON transport keeps dates (including log timestamps) without reviving user text. */
export type ReminderWire = { value: unknown; dates: string[][] };
export function encodeReminderPanel(input: unknown): ReminderWire {
  const dates: string[][] = [];
  function visit(value: unknown, path: string[]): unknown {
    if (value instanceof Date) { dates.push(path); return value.toISOString(); }
    if (Array.isArray(value)) return value.map((v, i) => visit(v, [...path, String(i)]));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v, [...path, k])]));
    return value;
  }
  return { value: visit(input, []), dates };
}
export function decodeReminderPanel<T>(wire: ReminderWire): T {
  for (const path of wire.dates) {
    let parent = wire.value as Record<string, unknown>;
    for (const key of path.slice(0, -1)) {
      if (["__proto__", "prototype", "constructor"].includes(key) || !Object.hasOwn(parent, key)) throw new Error("Invalid date path");
      parent = parent[key] as Record<string, unknown>;
    }
    const key = path.at(-1)!;
    if (["__proto__", "prototype", "constructor"].includes(key) || !Object.hasOwn(parent, key) || typeof parent[key] !== "string") throw new Error("Invalid date value");
    parent[key] = new Date(parent[key]);
  }
  return wire.value as T;
}
