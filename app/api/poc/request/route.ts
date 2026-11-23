import { NextRequest, NextResponse } from 'next/server';
import { cookieName, issueAttempt } from '../../../../lib/poc';
import { apiError, context, rateLimit } from '../../../../lib/verification-context';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const ctx = context(request);
    const rate = await rateLimit(ctx, 'request');
    const { token, signedRequest } = await issueAttempt(ctx);
    const response = NextResponse.json({ signedRequest, rateLimit: rate }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(cookieName, token, { httpOnly: true, secure: ctx.secure, sameSite: 'strict', path: '/api/poc', maxAge: 300 });
    return response;
  } catch (error) { return apiError(error, 'PQ_REQUEST_REJECTED'); }
}
