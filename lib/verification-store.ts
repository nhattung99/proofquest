import { z } from 'zod';
import type { Attempt } from './policy';

export class ServiceError extends Error {
  constructor(public code: string, public status: number, public retryAfter = 0) { super(code); }
}
export type StoredAttempt = Attempt & { sessionHash: string };
export type RateWindow = { remaining: number; resetAt: number };
export interface VerificationStore {
  save(token: string, attempt: StoredAttempt): Promise<void>;
  take(token: string, sessionHash: string): Promise<StoredAttempt | null>;
  limit(key: string, maximum: number, seconds: number): Promise<RateWindow>;
  clearCooldown(sessionHash: string): Promise<void>;
}
// One Lua command owns the session comparison and consume. No GET/DEL race.
export const TAKE_SCRIPT = `local raw=redis.call('GET',KEYS[1]); if not raw then return nil end; local a=cjson.decode(raw); if a.sessionHash~=ARGV[1] then return nil end; redis.call('DEL',KEYS[1]); return raw`;
export const LIMIT_SCRIPT = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('TTL',KEYS[1])}`;

export class RedisVerificationStore implements VerificationStore {
  constructor(private endpoint: string, private token: string, private prefix: string) {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new ServiceError('PQ_CONFIG', 503);
  }
  private async command(args: (string | number)[]): Promise<unknown> {
    try {
      const response = await fetch(this.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args), cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Storage unavailable');
      const body = await response.json();
      if (body.error || !Object.hasOwn(body, 'result')) throw new Error('Storage command rejected');
      return body.result;
    } catch { throw new ServiceError('PQ_STORAGE', 503); }
  }
  async save(token: string, attempt: StoredAttempt) {
    const result = await this.command(['SET', `${this.prefix}:attempt:${token}`, JSON.stringify(attempt), 'EX', 300, 'NX']);
    if (result !== 'OK') throw new ServiceError('PQ_STORAGE', 503);
  }
  async take(token: string, sessionHash: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const raw = await this.command(['EVAL', TAKE_SCRIPT, 1, `${this.prefix}:attempt:${token}`, sessionHash]);
    if (raw === null) return null;
    const schema = z.object({ recipient: z.string(), challenge: z.string(), createdAt: z.number(), expiresAt: z.number(), sessionHash: z.string() }).strict();
    try { return schema.parse(JSON.parse(z.string().parse(raw))); }
    catch { throw new ServiceError('PQ_STORAGE', 503); }
  }
  async limit(key: string, maximum: number, seconds: number) {
    const raw = await this.command(['EVAL', LIMIT_SCRIPT, 1, `${this.prefix}:limit:${key}`, seconds]);
    const result = z.tuple([z.number(), z.number()]).safeParse(raw);
    if (!result.success) throw new ServiceError('PQ_STORAGE', 503);
    if (result.data[0] > maximum) throw new ServiceError('PQ_RATE_LIMIT', 429, Math.max(1, result.data[1]));
    return { remaining: maximum - result.data[0], resetAt: Date.now() + Math.max(1, result.data[1]) * 1000 };
  }
  async clearCooldown(sessionHash: string) { await this.command(['DEL', `${this.prefix}:limit:cooldown:${sessionHash}`]); }
}

// Local development only. Public configuration never falls back to this store.
export class MemoryVerificationStore implements VerificationStore {
  private attempts = new Map<string, StoredAttempt>();
  private counters = new Map<string, { count: number; expires: number }>();
  async save(token: string, attempt: StoredAttempt) {
    for (const [key, item] of this.attempts) if (item.expiresAt < Date.now()) this.attempts.delete(key);
    this.attempts.set(token, attempt);
  }
  async take(token: string, sessionHash: string) {
    const value = this.attempts.get(token);
    if (!value || value.sessionHash !== sessionHash) return null;
    this.attempts.delete(token);
    return value.expiresAt >= Date.now() ? value : null;
  }
  async limit(key: string, maximum: number, seconds: number) {
    const now = Date.now();
    for (const [id, value] of this.counters) if (value.expires <= now) this.counters.delete(id);
    const value = this.counters.get(key) ?? { count: 0, expires: now + seconds * 1000 };
    value.count++; this.counters.set(key, value);
    if (value.count > maximum) throw new ServiceError('PQ_RATE_LIMIT', 429, Math.max(1, Math.ceil((value.expires - now) / 1000)));
    return { remaining: maximum - value.count, resetAt: value.expires };
  }
  async clearCooldown(sessionHash: string) { this.counters.delete(`cooldown:${sessionHash}`); }
}
const state = globalThis as typeof globalThis & { proofquestLocalStore?: MemoryVerificationStore };
export function verificationStore(publicMode: boolean, namespace: string) {
  if (!publicMode) return state.proofquestLocalStore ??= new MemoryVerificationStore();
  const endpoint = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!endpoint || !token) throw new ServiceError('PQ_CONFIG', 503);
  return new RedisVerificationStore(endpoint, token, `proofquest:${namespace}`);
}
