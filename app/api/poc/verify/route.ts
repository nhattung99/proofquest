import { NextRequest, NextResponse } from 'next/server';
import { cookieName, guard, readLimitedJson, verifyAttempt } from '../../../../lib/poc';
import { serverProofCode } from '../../../../lib/diagnostics';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    guard(request);
    const result = verifyAttempt(request.cookies.get(cookieName)?.value ?? '', await readLimitedJson(request));
    const response = NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(cookieName, '', { httpOnly: true, sameSite: 'strict', path: '/api/poc', maxAge: 0 });
    return response;
  } catch (error) {
    return NextResponse.json({ code: serverProofCode(error) }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
