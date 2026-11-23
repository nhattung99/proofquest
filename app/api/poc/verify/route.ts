import { NextRequest, NextResponse } from 'next/server';
import { cookieName, readLimitedJson, verifyAttempt } from '../../../../lib/poc';
import { serverProofCode } from '../../../../lib/diagnostics';
import { apiError, context, rateLimit } from '../../../../lib/verification-context';
import { walletCookie } from '../../../../lib/wallet-auth';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const ctx = context(request);
    await rateLimit(ctx, 'verify');
    const result = await verifyAttempt(request.cookies.get(cookieName)?.value ?? '', await readLimitedJson(request), ctx, request.cookies.get(walletCookie)?.value);
    const response = NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(cookieName, '', { httpOnly: true, secure: ctx.secure, sameSite: 'strict', path: '/api/poc', maxAge: 0 });
    return response;
  } catch (error) {
    return apiError(error, serverProofCode(error));
  }
}
