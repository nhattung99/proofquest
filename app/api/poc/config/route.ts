import { NextRequest, NextResponse } from 'next/server';
import { configuration } from '../../../../lib/poc';
import { apiError, context, rateLimit, setSession } from '../../../../lib/verification-context';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const { appId, templateId, recipient } = configuration();
    const ctx = context(request, true);
    await rateLimit(ctx, 'config');
    const response = NextResponse.json({ appId, templateId, recipient }, { headers: { 'Cache-Control': 'no-store' } });
    setSession(response, ctx);
    return response;
  } catch (error) { return apiError(error, 'PQ_CONFIG'); }
}
