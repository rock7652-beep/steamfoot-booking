// Run only after verifying the deployment source, database isolation and blocked delivery.
// Inputs are private file paths, never credentials in command-line arguments.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.argv[2];
const out = process.env.CRON_QA_REPORT_DIR;
const expired = process.argv.includes('--expect-expired');
assert.ok(/^https:\/\/steamfoot-booking-[a-z0-9]+-rock7652-2111s-projects\.vercel\.app$/.test(base), 'Requires the authorized project Preview origin');
assert.ok(out, 'Set CRON_QA_REPORT_DIR to a fresh evidence directory');
assert.ok(!fs.existsSync(out + '/http-results.json'), 'Do not overwrite existing acceptance evidence');
const identity = fs.readFileSync(process.env.VERCEL_QA_IDENTITY_FILE || '.env.local', 'utf8');
const token = identity.match(/^VERCEL_OIDC_TOKEN=["']?([^"'\r\n]+)["']?/m)?.[1];
const secret = fs.readFileSync(process.env.CRON_QA_SECRET_FILE || '/tmp/digital-manager-cron-qa-secret', 'utf8').trim();
assert.ok(token && secret, 'Missing scoped test identity or secret');
fs.mkdirSync(out, { recursive: true });
const results = [];
const save = () => fs.writeFileSync(out + '/http-results.json', JSON.stringify(results, null, 2));
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'],
    proxy: { server: process.env.HTTPS_PROXY || process.env.HTTP_PROXY },
  });
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => new URL(route.request().url()).origin === base
      ? route.continue({ headers: { ...route.request().headers(), 'x-vercel-trusted-oidc-idp-token': token } })
      : route.abort());
    const page = await context.newPage();
    await page.goto(base + '/hq/login', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    for (const path of ['incomplete-service-reminders', 'daily-action-digest', 'beauty-notifications']) {
      for (const mode of (expired ? ['authorized'] : ['missing', 'wrong', 'authorized', 'repeat'])) {
        const result = await page.evaluate(async ({ path, mode, secret }) => {
          const response = await fetch('/api/cron/' + path, {
            headers: mode === 'missing' ? {} : { authorization: 'Bearer ' + (mode === 'wrong' ? 'wrong' : secret) },
            cache: 'no-store',
          });
          return { path, mode, status: response.status, body: await response.json() };
        }, { path, mode, secret });
        results.push(result); save(); console.log(JSON.stringify(result));
        assert.equal(result.status, expired || ['missing', 'wrong'].includes(mode) ? 401 : 200);
        if (result.status === 200) {
          assert.equal(result.body.failed, 0);
          if (path === 'beauty-notifications') {
            assert.equal(result.body.sent, 0);
            assert.equal(result.body.digitalManager.failed, 0);
          }
        }
      }
    }
    for (const path of ['/api/cron/reminders', '/api/health/reminders-cron']) {
      const status = await page.evaluate(async ({ path, secret }) =>
        (await fetch(path, { headers: { authorization: 'Bearer ' + secret } })).status, { path, secret });
      results.push({ path, mode: 'outside-scope', status }); save();
      assert.equal(status, 401);
    }
  } finally { await browser.close(); }
})().catch(error => {
  console.error('FAILED', error.message.replace(/https?:\/\/\S+/g, '[URL]'));
  process.exitCode = 1;
});
