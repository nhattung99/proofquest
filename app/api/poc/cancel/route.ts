import { NextRequest, NextResponse } from 'next/server';
import { cookieName } from '../../../../lib/poc';
import { apiError, context, rateLimit } from '../../../../lib/verification-context';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const ctx = context(request);
    await rateLimit(ctx, 'cancel');
    await ctx.store.take(request.cookies.get(cookieName)?.value ?? '', ctx.sessionHash);
    const response = NextResponse.json({ cancelled: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(cookieName, '', { httpOnly: true, secure: ctx.secure, sameSite: 'strict', path: '/api/poc', maxAge: 0 });
    return response;
  } catch (error) { return apiError(error, 'PQ_REQUEST_REJECTED'); }
}
