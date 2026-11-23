import { NextRequest, NextResponse } from 'next/server';
import { readLimitedJson } from '../../../../../lib/poc';
import { apiError, context, rateLimit, setSession } from '../../../../../lib/verification-context';
import { createWalletChallenge, loginCookie, revokeLoginChallenge } from '../../../../../lib/wallet-auth';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const ctx = context(request, true);
    await rateLimit(ctx, 'wallet');
    await revokeLoginChallenge(ctx, request.cookies.get(loginCookie)?.value);
    const challenge = await createWalletChallenge(ctx, await readLimitedJson(request));
    const response = NextResponse.json({ message: challenge.message }, { headers: { 'Cache-Control': 'no-store' } });
    setSession(response, ctx);
    response.cookies.set(loginCookie, challenge.token, { httpOnly: true, secure: ctx.secure, sameSite: 'strict', path: '/api/poc', maxAge: 300 });
    return response;
  } catch (error) { return apiError(error, 'PQ_WALLET_LOGIN'); }
}
