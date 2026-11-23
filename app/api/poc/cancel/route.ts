import { NextRequest, NextResponse } from 'next/server';
import { cancelAttempt, cookieName, guard } from '../../../../lib/poc';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    guard(request);
    cancelAttempt(request.cookies.get(cookieName)?.value ?? '');
    const response = NextResponse.json({ cancelled: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(cookieName, '', { httpOnly: true, sameSite: 'strict', path: '/api/poc', maxAge: 0 });
    return response;
  } catch { return NextResponse.json({ code: 'PQ_REQUEST_REJECTED' }, { status: 400 }); }
}
