/** Normalize the two real Prisma raw-query call forms without changing bindings. */
export function rawQueryParts(input: TemplateStringsArray | { strings: readonly string[]; values: readonly unknown[] }, values: readonly unknown[] = []): {strings: readonly string[]; values: readonly unknown[]} {
  return Array.isArray(input)
    ? { strings: input, values }
    : input as { strings: readonly string[]; values: readonly unknown[] };
}
export function rawQueryText(input: TemplateStringsArray | { strings: readonly string[]; values: readonly unknown[] }) {
  return rawQueryParts(input).strings.join("");
}
