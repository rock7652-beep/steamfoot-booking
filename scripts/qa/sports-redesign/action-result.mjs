import assert from "node:assert/strict";
/** Server Action failures also use HTTP 200. Verify the returned action value. */
export function readActionResult(body) {
  for (const line of body.split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    try {
      const value = JSON.parse(line.slice(colon + 1));
      if (
        value &&
        typeof value === "object" &&
        typeof value.success === "boolean"
      )
        return value;
    } catch {}
  }
  throw Error(
    "Server Action response did not contain an explicit business result",
  );
}
export async function assertActionSuccess(response) {
  assert.ok(response.ok(), `HTTP ${response.status()}`);
  const result = readActionResult(await response.text());
  assert.equal(
    result.success,
    true,
    result.error ?? "Server Action rejected the request",
  );
  return result;
}
