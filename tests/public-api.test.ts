import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as config } from '../app/api/poc/config/route';
import { POST as sign } from '../app/api/poc/request/route';
import { POST as verify } from '../app/api/poc/verify/route';
import { sessionCookieName } from '../lib/verification-context';
import { LIMIT_SCRIPT, TAKE_SCRIPT } from '../lib/verification-store';

const origin = 'https://proofquest-nu.vercel.app';
let state: Map<string, string>;
let calls: number;
beforeEach(() => {
  state = new Map(); calls = 0;
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('PROOFQUEST_PUBLIC_VERIFICATION_ENABLED', 'true');
  vi.stubEnv('PROOFQUEST_PUBLIC_ORIGIN', origin);
  vi.stubEnv('PRIMUS_APP_ID', 'synthetic-app');
  vi.stubEnv('PRIMUS_APP_SECRET', `0x${'12'.repeat(32)}`);
  vi.stubEnv('PRIMUS_RECIPIENT', '0x1111111111111111111111111111111111111111');
  vi.stubEnv('PRIMUS_TEMPLATE_ID', '2e3160ae-8b1e-45e3-8c59-426366278b9d');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'synthetic-store-token');
  // HTTP adapter fixture only; a real Redis/Lua integration test still needs credentials.
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
    calls++;
    const args = JSON.parse(String(options.body));
    if (args[0] === 'SET') { state.set(args[1], args[2]); return Response.json({ result: 'OK' }); }
    if (args[1] === LIMIT_SCRIPT) {
      const count = Number(state.get(args[3]) ?? 0) + 1; state.set(args[3], String(count));
      return Response.json({ result: [count, Number(args[4])] });
    }
    if (args[1] === TAKE_SCRIPT) {
      const value = state.get(args[3]);
      if (!value || JSON.parse(value).sessionHash !== args[4]) return Response.json({ result: null });
      state.delete(args[3]); return Response.json({ result: value });
    }
    throw new Error('Unexpected command');
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function req(path: string, method = 'GET', cookie = '', requestOrigin = origin) {
  return new NextRequest(origin + path, { method, headers: { host: 'proofquest-nu.vercel.app', origin: requestOrigin, cookie, 'x-vercel-forwarded-for': '192.0.2.1', 'content-type': 'application/json' }, ...(method === 'POST' && path.endsWith('/verify') ? { body: '{}' } : {}) });
}
it('creates a secure opaque session and returns only public configuration', async () => {
  const response = await config(req('/api/poc/config'));
  expect(response.status).toBe(200);
  const serialized = JSON.stringify(await response.json());
  expect(serialized).not.toContain(process.env.PRIMUS_APP_SECRET!);
  expect(serialized).not.toContain('synthetic-store-token');
  const cookie = response.cookies.get(sessionCookieName)!;
  expect(cookie.value).toMatch(/^[0-9a-f]{64}$/);
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'strict' });
});
it('does not reveal malformed or missing server credentials', async () => {
  vi.stubEnv('PRIMUS_APP_SECRET', '');
  const response = await config(req('/api/poc/config'));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: 'PQ_CONFIG' });
});
it('requires same origin and a session before spending signing quota', async () => {
  expect((await sign(req('/api/poc/request', 'POST', '', 'https://evil.example'))).status).toBe(403);
  expect((await sign(req('/api/poc/request', 'POST'))).status).toBe(401);
  expect(calls).toBe(0);
});
it('binds attempts to the session across separate route calls and consumes once', async () => {
  const configured = await config(req('/api/poc/config'));
  const session = configured.cookies.get(sessionCookieName)!.value;
  const signed = await sign(req('/api/poc/request', 'POST', `${sessionCookieName}=${session}`));
  expect(signed.status).toBe(200);
  const token = signed.cookies.get('proofquest_poc')!.value;
  const cookie = `${sessionCookieName}=${session}; proofquest_poc=${token}`;
  const other = `${sessionCookieName}=${'f'.repeat(64)}; proofquest_poc=${token}`;
  expect(await (await verify(req('/api/poc/verify', 'POST', other))).json()).toMatchObject({ code: 'PQ_ATTEMPT' });
  expect(await (await verify(req('/api/poc/verify', 'POST', cookie))).json()).toMatchObject({ code: 'PQ_PAYLOAD' });
  expect(await (await verify(req('/api/poc/verify', 'POST', cookie))).json()).toMatchObject({ code: 'PQ_ATTEMPT' });
});
it('returns a friendly 429 and Retry-After before issuing a second request inside cooldown', async () => {
  const configured = await config(req('/api/poc/config'));
  const cookie = `${sessionCookieName}=${configured.cookies.get(sessionCookieName)!.value}`;
  expect((await sign(req('/api/poc/request', 'POST', cookie))).status).toBe(200);
  const limited = await sign(req('/api/poc/request', 'POST', cookie));
  expect(limited.status).toBe(429);
  expect(limited.headers.get('Retry-After')).toBe('30');
  expect(await limited.json()).toEqual({ code: 'PQ_RATE_LIMIT' });
});
