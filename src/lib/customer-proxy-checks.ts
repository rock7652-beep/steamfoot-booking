import 'server-only';

/** Run independent read checks together, but never let auth bypass store denial.
 * Capture auth failures immediately, including a failure after an early denial.
 * No response, session or authorization result is cached between requests.
 */
export async function parallelCustomerProxyChecks<T>(
  retirement: Promise<Response | null>, authenticate: () => T | Promise<T>,
): Promise<Response | T> {
  const authentication = Promise.resolve().then(authenticate).then(
    response => ({ok:true as const,response}),
    error => ({ok:false as const,error}),
  );
  const denied = await retirement;
  if (denied) return denied;
  const result = await authentication;
  if (!result.ok) throw result.error;
  return result.response;
}
