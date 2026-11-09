import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRuntimeTarget, inspectRuntime, safeFailure } from '../subscription-referral-runtime-preflight.mjs';
import { verifyBeautyProductionCa, BEAUTY_SUPABASE_CA_FINGERPRINT } from '../beauty-production-ca.mjs';
import { createSecureContext } from 'node:tls';

test('existing pinned official CA is a valid trust anchor', () => {
  const certificate = verifyBeautyProductionCa();
  assert.equal(certificate.ca, true);
  assert.equal(certificate.fingerprint256, BEAUTY_SUPABASE_CA_FINGERPRINT);
  assert.doesNotThrow(() => createSecureContext({ ca: certificate.toString() }));
});

test('only emits known codes and phases; never raw driver errors', () => {
  const secret = 'synthetic-password-must-not-appear';
  const result = safeFailure({ code: 'SELF_SIGNED_CERT_IN_CHAIN', message: secret }, 'connect');
  assert.deepEqual(result, { stage: 'connect', code: 'SELF_SIGNED_CERT_IN_CHAIN' });
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.deepEqual(safeFailure({ code: secret, message: secret }, secret),
    { stage: 'unknown', code: 'UNCLASSIFIED' });
});

test('refuses missing URL, other project, fake host and disabled TLS', () => {
  for (const raw of [undefined,
    'postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co/postgres',
    'postgresql://postgres.qijlnhtpbintanzpxkvf:synthetic@evil.example/postgres',
    'postgresql://postgres:synthetic@db.qijlnhtpbintanzpxkvf.supabase.co/postgres?sslmode=disable']) {
    assert.throws(() => validateRuntimeTarget(raw));
  }
});

test('accepts only recognized production direct or pooler target', () => {
  for (const raw of [
    'postgresql://postgres:synthetic@db.qijlnhtpbintanzpxkvf.supabase.co/postgres',
    'postgresql://postgres.qijlnhtpbintanzpxkvf:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres']) {
    assert.equal(validateRuntimeTarget(raw).project, 'qijlnhtpbintanzpxkvf');
  }
});

test('successful catalog inspection stays read-only and rolls back', async () => {
  const calls = [];
  await inspectRuntime({ query: async sql => { calls.push(sql); return { rows: [] }; } });
  assert.equal(calls[0], 'BEGIN READ ONLY');
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.equal(calls.some(sql => /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT)\b/i.test(sql)), false);
});

test('query failure rolls back without returning partial success', async () => {
  const calls = [];
  await assert.rejects(inspectRuntime({ query: async sql => {
    calls.push(sql);
    if (sql.startsWith('WITH required')) throw new Error('synthetic failure');
    return { rows: [] };
  } }));
  assert.equal(calls.at(-1), 'ROLLBACK');
});
