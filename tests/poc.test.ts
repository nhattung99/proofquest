import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelAttempt, guard, issueAttempt, verifyAttempt } from '../lib/poc';
afterEach(() => vi.unstubAllEnvs());
describe('local experiment isolation', () => {
  it('is disabled by default', () => {
    vi.stubEnv('PROOFQUEST_POC_ENABLED', 'false');
    expect(() => guard(new Request('http://localhost:3000', { headers: { host: 'localhost:3000' } }))).toThrow();
  });
  it('refuses proof operations on Vercel even if local enablement is set', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('PROOFQUEST_POC_ENABLED', 'true');
    expect(() => guard(new Request('http://localhost:3000', { headers: { host: 'localhost:3000' } }))).toThrow('Public preview only');
  });
  it('refuses remote hosts and cross-origin posts', () => {
    vi.stubEnv('PROOFQUEST_POC_ENABLED', 'true');
    expect(() => guard(new Request('https://proofquest.example', { headers: { host: 'proofquest.example' } }))).toThrow();
    expect(() => guard(new Request('http://localhost:3000', { method: 'POST', headers: { host: 'localhost:3000', origin: 'https://evil.example' } }))).toThrow();
  });
  it('allows same-origin local requests when enabled', () => {
    vi.stubEnv('PROOFQUEST_POC_ENABLED', 'true');
    expect(() => guard(new Request('http://127.0.0.1:3000', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } }))).not.toThrow();
  });
  it('refuses missing attempts', () => expect(() => verifyAttempt('missing', {})).toThrow());
  it('accepts Next-normalized loopback URL only with matching public origin and port', () => {
    vi.stubEnv('PROOFQUEST_POC_ENABLED', 'true');
    const local = (host: string, origin: string) => new Request('http://localhost:3001', { method: 'POST', headers: { host, origin } });
    expect(() => guard(local('127.0.0.1:3001', 'http://127.0.0.1:3001'))).not.toThrow();
    expect(() => guard(local('127.0.0.1:3002', 'http://127.0.0.1:3002'))).toThrow();
    expect(() => guard(local('127.0.0.1:3001', 'http://localhost:3001'))).toThrow();
    expect(() => guard(local('evil.example:3001', 'http://evil.example:3001'))).toThrow();
  });
  it('signs only configured requests and consumes attempts before reuse', async () => {
    vi.stubEnv('PRIMUS_APP_ID', 'synthetic-test-app');
    // Disposable synthetic application signing key, never funded or used as a wallet.
    vi.stubEnv('PRIMUS_APP_SECRET', `0x${'12'.repeat(32)}`);
    vi.stubEnv('PRIMUS_TEMPLATE_ID', '2e3160ae-8b1e-45e3-8c59-426366278b9d');
    vi.stubEnv('PRIMUS_RECIPIENT', '0x1111111111111111111111111111111111111111');
    const { token, signedRequest } = await issueAttempt();
    const request = JSON.parse(signedRequest);
    expect(request.attRequest.attTemplateID).toBe(process.env.PRIMUS_TEMPLATE_ID);
    expect(request.appSignature).toMatch(/^0x[0-9a-f]{130}$/i);
    expect(() => verifyAttempt(token, {})).toThrow();
    expect(() => verifyAttempt(token, {})).toThrow('already consumed');
    await expect(issueAttempt()).rejects.toThrow('Wait 30 seconds');
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
    try {
      const next = await issueAttempt();
      cancelAttempt(next.token);
      expect(() => verifyAttempt(next.token, {})).toThrow('Unknown or already consumed attempt');
    } finally { clock.mockRestore(); }
  });
});
