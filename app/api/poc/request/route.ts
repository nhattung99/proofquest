import { NextRequest, NextResponse } from 'next/server';
import { cookieName, issueAttempt } from '../../../../lib/poc';
import { apiError, context, rateLimit } from '../../../../lib/verification-context';
import { readLimitedJson } from '../../../../lib/poc';
import { walletCookie, walletSession } from '../../../../lib/wallet-auth';
import { ServiceError } from '../../../../lib/verification-store';
import { z } from 'zod';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const ctx = context(request);
    const input = request.body && request.headers.get('content-type')?.startsWith('application/json') ? z.discriminatedUnion('bind', [z.object({ bind: z.literal(false) }).strict(), z.object({ bind: z.literal(true), address: z.string().regex(/^0x[0-9a-fA-F]{40}$/), chainId: z.number().int().positive() }).strict()]).parse(await readLimitedJson(request)) : { bind: false as const };
    const wallet = input.bind ? await walletSession(ctx, request.cookies.get(walletCookie)?.value) : null;
    if (input.bind && (!wallet || wallet.address.toLowerCase() !== input.address.toLowerCase() || wallet.chainId !== input.chainId)) throw new ServiceError('PQ_WALLET_SESSION', 401);
    const rate = await rateLimit(ctx, 'request');
    const { token, signedRequest } = await issueAttempt(ctx, wallet ?? undefined);
    const response = NextResponse.json({ signedRequest, rateLimit: rate }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(cookieName, token, { httpOnly: true, secure: ctx.secure, sameSite: 'strict', path: '/api/poc', maxAge: 300 });
    return response;
  } catch (error) { return apiError(error, 'PQ_REQUEST_REJECTED'); }
}
