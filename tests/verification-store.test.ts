import { afterEach, expect, it, vi } from 'vitest';
import { MemoryVerificationStore, RedisVerificationStore, TAKE_SCRIPT, verificationStore } from '../lib/verification-store';
const attempt = { recipient: '0x1111111111111111111111111111111111111111', challenge: 'synthetic-challenge', createdAt: Date.now(), expiresAt: Date.now() + 300000, sessionHash: 'owner' };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('accepts exactly one concurrent consume and prevents cross-session burning', async () => {
  const store = new MemoryVerificationStore(); const token = 'a'.repeat(64);
  await store.save(token, attempt);
  expect(await store.take(token, 'other')).toBeNull();
  const results = await Promise.all([store.take(token, 'owner'), store.take(token, 'owner')]);
  expect(results.filter(Boolean)).toHaveLength(1);
});
it('enforces independent rate buckets and expiry', async () => {
  const store = new MemoryVerificationStore();
  await store.limit('ip', 1, 3600);
  await expect(store.limit('ip', 1, 3600)).rejects.toMatchObject({ code: 'PQ_RATE_LIMIT', status: 429 });
  await expect(store.limit('other-ip', 1, 3600)).resolves.toBeUndefined();
});
it('uses a single authenticated atomic EVAL for session-bound consume', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ result: JSON.stringify(attempt) }));
  vi.stubGlobal('fetch', fetcher);
  const store = new RedisVerificationStore('https://example.upstash.io', 'synthetic-token', 'test');
  expect(await store.take('a'.repeat(64), 'owner')).toEqual(attempt);
  const options = fetcher.mock.calls[0][1];
  expect(options.headers.Authorization).toBe('Bearer synthetic-token');
  expect(JSON.parse(options.body)).toEqual(['EVAL', TAKE_SCRIPT, 1, `test:attempt:${'a'.repeat(64)}`, 'owner']);
});
it('fails closed on Redis errors instead of local memory fallback', async () => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', ''); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  expect(() => verificationStore(true, 'test')).toThrow('PQ_CONFIG');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'private-backend-error' })));
  const store = new RedisVerificationStore('https://example.upstash.io', 'synthetic-token', 'test');
  await expect(store.take('a'.repeat(64), 'owner')).rejects.toMatchObject({ code: 'PQ_STORAGE', message: 'PQ_STORAGE' });
});
it('returns safe hourly retry metadata from Redis limiter', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ result: [6, 3000] })));
  const store = new RedisVerificationStore('https://example.upstash.io', 'synthetic-token', 'test');
  await expect(store.limit('session', 5, 3600)).rejects.toMatchObject({ code: 'PQ_RATE_LIMIT', retryAfter: 3000 });
});
