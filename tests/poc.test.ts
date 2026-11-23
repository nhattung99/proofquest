import { afterEach, describe, expect, it, vi } from 'vitest';
import { guard, issueAttempt, verifyAttempt } from '../lib/poc';
import { MemoryVerificationStore } from '../lib/verification-store';
import type { VerificationContext } from '../lib/verification-context';
afterEach(() => vi.unstubAllEnvs());
function fixtureContext(): VerificationContext {
  return { origin: 'http://localhost:3000', session: 'a'.repeat(64), sessionHash: 'b'.repeat(64), ipHash: 'c'.repeat(64), secure: false, store: new MemoryVerificationStore() };
}
describe('verification isolation', () => {
  it('is disabled without explicit configuration', () => {
    vi.stubEnv('PROOFQUEST_POC_ENABLED', 'false');
    expect(() => guard(new Request('http://localhost:3000', { headers: { host: 'localhost:3000' } }))).toThrow();
  });
  it('does not enable Vercel verification from the local experiment flag', () => {
    vi.stubEnv('VERCEL', '1'); vi.stubEnv('PROOFQUEST_POC_ENABLED', 'true');
    expect(() => guard(new Request('http://localhost:3000', { headers: { host: 'localhost:3000' } }))).toThrow('PQ_CONFIG');
  });
  it('allows only configured HTTPS public host and exact Origin', () => {
    vi.stubEnv('PROOFQUEST_PUBLIC_VERIFICATION_ENABLED', 'true');
    vi.stubEnv('PROOFQUEST_PUBLIC_ORIGIN', 'https://proofquest-nu.vercel.app');
    const request = (host: string, origin: string) => new Request('https://proofquest-nu.vercel.app/api/poc/request', { method: 'POST', headers: { host, origin } });
    expect(() => guard(request('proofquest-nu.vercel.app', 'https://proofquest-nu.vercel.app'))).not.toThrow();
    expect(() => guard(request('proofquest-nu.vercel.app', 'https://evil.example'))).toThrow('PQ_ORIGIN');
    expect(() => guard(request('evil.example', 'https://proofquest-nu.vercel.app'))).toThrow('PQ_ORIGIN');
    vi.stubEnv('PROOFQUEST_PUBLIC_ORIGIN', 'http://proofquest-nu.vercel.app');
    expect(() => guard(request('proofquest-nu.vercel.app', 'https://proofquest-nu.vercel.app'))).toThrow('PQ_CONFIG');
  });
  it('accepts Next-normalized loopback URL only with matching public origin and port', () => {
    vi.stubEnv('PROOFQUEST_POC_ENABLED', 'true');
    const local = (host: string, origin: string) => new Request('http://localhost:3001', { method: 'POST', headers: { host, origin } });
    expect(() => guard(local('127.0.0.1:3001', 'http://127.0.0.1:3001'))).not.toThrow();
    expect(() => guard(local('127.0.0.1:3002', 'http://127.0.0.1:3002'))).toThrow();
    expect(() => guard(local('127.0.0.1:3001', 'http://localhost:3001'))).toThrow();
  });
  it('signs the fixed request and consumes failed/cancelled attempts once', async () => {
    vi.stubEnv('PRIMUS_APP_ID', 'synthetic-test-app');
    vi.stubEnv('PRIMUS_APP_SECRET', `0x${'12'.repeat(32)}`);
    vi.stubEnv('PRIMUS_TEMPLATE_ID', '2e3160ae-8b1e-45e3-8c59-426366278b9d');
    vi.stubEnv('PRIMUS_RECIPIENT', '0x1111111111111111111111111111111111111111');
    const ctx = fixtureContext();
    const { token, signedRequest } = await issueAttempt(ctx);
    const request = JSON.parse(signedRequest);
    expect(request.attRequest.attTemplateID).toBe(process.env.PRIMUS_TEMPLATE_ID);
    expect(request.appSignature).toMatch(/^0x[0-9a-f]{130}$/i);
    await expect(verifyAttempt(token, {}, { ...ctx, sessionHash: 'another-session' })).rejects.toThrow('Unknown');
    await expect(verifyAttempt(token, {}, ctx)).rejects.toThrow();
    await expect(verifyAttempt(token, {}, ctx)).rejects.toThrow('Unknown');
    const next = await issueAttempt(ctx);
    await ctx.store.take(next.token, ctx.sessionHash);
    await expect(verifyAttempt(next.token, {}, ctx)).rejects.toThrow('Unknown');
  });
});
