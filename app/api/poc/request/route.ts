import { NextResponse } from 'next/server';
import { cookieName, guard, issueAttempt } from '../../../../lib/poc';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    guard(request);
    const { token, signedRequest } = await issueAttempt();
    const response = NextResponse.json({ signedRequest }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(cookieName, token, { httpOnly: true, sameSite: 'strict', path: '/api/poc', maxAge: 300 });
    return response;
  } catch {
    return NextResponse.json({ code: 'PQ_REQUEST_REJECTED' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
