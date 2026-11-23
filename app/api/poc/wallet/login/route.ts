import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readLimitedJson } from '../../../../../lib/poc';
import { apiError, context, rateLimit } from '../../../../../lib/verification-context';
import { authenticateWallet, loginCookie, walletCookie } from '../../../../../lib/wallet-auth';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const ctx = context(request);
    await rateLimit(ctx, 'wallet');
    const { signature } = z.object({ signature: z.string().max(132) }).strict().parse(await readLimitedJson(request));
    const auth = await authenticateWallet(ctx, request.cookies.get(loginCookie)?.value ?? '', signature);
    const response = NextResponse.json({ address: auth.address, chainId: auth.chainId, expiresAt: auth.expiresAt }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(walletCookie, auth.token, { httpOnly: true, secure: ctx.secure, sameSite: 'strict', path: '/api/poc', maxAge: 3600 });
    response.cookies.set(loginCookie, '', { httpOnly: true, secure: ctx.secure, sameSite: 'strict', path: '/api/poc', maxAge: 0 });
    return response;
  } catch (error) { return apiError(error, 'PQ_WALLET_LOGIN'); }
}
