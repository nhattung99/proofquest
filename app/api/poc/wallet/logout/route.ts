import { NextRequest, NextResponse } from 'next/server';
import { apiError, context, rateLimit } from '../../../../../lib/verification-context';
import { loginCookie, revokeLoginChallenge, revokeWallet, walletCookie } from '../../../../../lib/wallet-auth';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const ctx = context(request);
    await rateLimit(ctx, 'wallet');
    await revokeWallet(ctx, request.cookies.get(walletCookie)?.value);
    await revokeLoginChallenge(ctx, request.cookies.get(loginCookie)?.value);
    const response = NextResponse.json({ signedOut: true }, { headers: { 'Cache-Control': 'no-store' } });
    for (const cookie of [walletCookie, loginCookie]) response.cookies.set(cookie, '', { httpOnly: true, secure: ctx.secure, sameSite: 'strict', path: '/api/poc', maxAge: 0 });
    return response;
  } catch (error) { return apiError(error, 'PQ_WALLET_LOGIN'); }
}
