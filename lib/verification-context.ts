import { createHmac, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ServiceError, verificationStore } from './verification-store';
export const sessionCookieName = 'proofquest_session';
export const attemptCookieName = 'proofquest_poc';
export function verificationMode() {
  if (process.env.PROOFQUEST_PUBLIC_VERIFICATION_ENABLED === 'true') return 'public';
  if (process.env.VERCEL !== '1' && process.env.PROOFQUEST_POC_ENABLED === 'true') return 'local';
  throw new ServiceError('PQ_CONFIG', 503);
}
export function allowedOrigin() {
  const raw = process.env.PROOFQUEST_PUBLIC_ORIGIN;
  if (!raw) throw new ServiceError('PQ_CONFIG', 503);
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.origin !== raw || url.username || url.password || ['localhost', '127.0.0.1'].includes(url.hostname)) throw new ServiceError('PQ_CONFIG', 503);
  return url;
}
export function guard(request: Request) {
  const mode = verificationMode();
  const url = new URL(request.url);
  const host = request.headers.get('host') ?? '';
  let expected: URL;
  if (mode === 'public') {
    expected = allowedOrigin();
    if (host !== expected.host) throw new ServiceError('PQ_ORIGIN', 403);
  } else {
    if (!/^(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$/.test(host)) throw new ServiceError('PQ_ORIGIN', 403);
    expected = new URL(`${url.protocol}//${host}`);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || expected.port !== url.port) throw new ServiceError('PQ_ORIGIN', 403);
  }
  if (request.method !== 'GET' && request.headers.get('origin') !== expected.origin) throw new ServiceError('PQ_ORIGIN', 403);
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new ServiceError('PQ_ORIGIN', 403);
  return expected.origin;
}
export function digest(value: string) {
  const secret = process.env.PRIMUS_APP_SECRET;
  if (!secret) throw new ServiceError('PQ_CONFIG', 503);
  return createHmac('sha256', secret).update(`proofquest-v1:${value}`).digest('hex');
}
export function context(request: NextRequest, createSession = false) {
  const origin = guard(request);
  const mode = verificationMode();
  const existing = request.cookies.get(sessionCookieName)?.value;
  const valid = existing && /^[a-f0-9]{64}$/.test(existing);
  if (!valid && !createSession) throw new ServiceError('PQ_SESSION', 401);
  const session = valid ? existing : randomBytes(32).toString('hex');
  // Vercel overwrites x-vercel-forwarded-for. Never trust client x-forwarded-for.
  const forwarded = mode === 'public' && process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() : 'local';
  if (!forwarded) throw new ServiceError('PQ_SESSION', 401);
  const sessionHash = digest(`session:${session}`);
  return { origin, session, sessionHash, ipHash: digest(`ip:${forwarded}`), secure: mode === 'public', store: verificationStore(mode === 'public', digest(`origin:${origin}`).slice(0, 16)) };
}
export type VerificationContext = ReturnType<typeof context>;
export function setSession(response: NextResponse, ctx: VerificationContext) {
  response.cookies.set(sessionCookieName, ctx.session, { httpOnly: true, secure: ctx.secure, sameSite: 'strict', path: '/api/poc', maxAge: 3600 });
}
export async function rateLimit(ctx: VerificationContext, action: 'config' | 'request' | 'verify' | 'cancel') {
  // Request caps are abuse protection, not proof credits. Cooldown refusals
  // must not consume the hourly allowance. Cancellation releases only the
  // session cooldown, never the hard abuse cap.
  const limits = { config: [120, 120], request: [30, 60], verify: [30, 60], cancel: [120, 180] } as const;
  const [sessionLimit, ipLimit] = limits[action];
  if (action === 'request') await ctx.store.limit(`cooldown:${ctx.sessionHash}`, 1, 30);
  const ip = await ctx.store.limit(`ip:${action}:${ctx.ipHash}`, ipLimit, 3600);
  const session = await ctx.store.limit(`session:${action}:${ctx.sessionHash}`, sessionLimit, 3600);
  return session.remaining <= ip.remaining ? session : ip;
}
export function apiError(error: unknown, fallback: string) {
  const service = error instanceof ServiceError ? error : null;
  const response = NextResponse.json({ code: service?.code ?? fallback, ...(service?.retryAfter ? { retryAfter: service.retryAfter, resetAt: Date.now() + service.retryAfter * 1000 } : {}) }, { status: service?.status ?? (fallback === 'PQ_CONFIG' ? 503 : 400), headers: { 'Cache-Control': 'no-store' } });
  if (service?.retryAfter) response.headers.set('Retry-After', String(service.retryAfter));
  return response;
}
