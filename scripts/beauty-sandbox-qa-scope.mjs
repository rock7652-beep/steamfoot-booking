import { assertBeautyLocalQaEnvironment } from './beauty-local-qa-scope.mjs';

// Issued to the task-owned Sandbox, never a production/preview deployment.
export const BEAUTY_SANDBOX_ORIGIN = 'https://sb-5xmothc5nvzv.vercel.run';

export function assertBeautySandboxQaEnvironment(env) {
  if (env.BEAUTY_SANDBOX_QA !== '1' || env.BEAUTY_LOCAL_QA === '1' ||
      env.BEAUTY_SANDBOX_ORIGIN !== BEAUTY_SANDBOX_ORIGIN ||
      env.AUTH_URL !== BEAUTY_SANDBOX_ORIGIN || env.NEXTAUTH_URL !== env.AUTH_URL) {
    throw new Error('Beauty Sandbox requires its exact task-owned HTTPS origin.');
  }
  // Keep all existing no-hosted-metadata, loopback DB, role and no-send checks.
  assertBeautyLocalQaEnvironment({...env,BEAUTY_LOCAL_QA:'1',AUTH_URL:'http://localhost:3114',NEXTAUTH_URL:'http://localhost:3114'});
}

/** The Sandbox HTTPS proxy fronts a dev server bound to 0.0.0.0:3000.
 * Match Next's internal rewrite origin instead of proxying back through its
 * public URL. Authentication, store headers and page/action guards still run.
 * Outside this exact QA scope, preserve the existing URL unchanged. */
export function beautySandboxRewriteUrl(path, requestUrl, forwardedProto, env) {
  const url = new URL(path,requestUrl);
  if (env.BEAUTY_SANDBOX_QA !== '1') return url;
  assertBeautySandboxQaEnvironment(env);
  url.protocol = forwardedProto?.includes('https') ? 'https:' : 'http:';
  url.hostname = '0.0.0.0';
  url.port = '3000';
  return url;
}

/** Sandbox TLS terminates before Next, whose Request URL uses its internal
 * listener. Accept only the pinned public Origin after the complete QA guard;
 * never infer a trusted origin from forwarded/host headers. Normal hosts keep
 * their existing strict URL-origin check. */
export function beautySandboxSameOrigin(requestUrl, origin, env) {
  const requestOrigin = new URL(requestUrl).origin;
  if (env.BEAUTY_SANDBOX_QA !== '1') return origin === requestOrigin;
  assertBeautySandboxQaEnvironment(env);
  return origin === BEAUTY_SANDBOX_ORIGIN && [
    BEAUTY_SANDBOX_ORIGIN,
    'http://localhost:3000', 'https://localhost:3000',
    'http://0.0.0.0:3000', 'https://0.0.0.0:3000',
  ].includes(requestOrigin);
}
