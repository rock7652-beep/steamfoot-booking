/** Never put authentication material into audit snapshots or rendered history. */
export function redactAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[內容過深]";
  if (Array.isArray(value)) return value.map(item => redactAuditValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      /password|secret|token|authorization|cookie|otp|verificationcode/i.test(key)
        ? "[已隱藏]" : redactAuditValue(item, depth + 1),
    ]));
  }
  return value;
}
