import { NextRequest, NextResponse } from 'next/server';
import { apiError, context, rateLimit } from '../../../../../lib/verification-context';
import { walletCookie, walletProfile, walletSession } from '../../../../../lib/wallet-auth';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const ctx = context(request);
    await rateLimit(ctx, 'wallet');
    const auth = await walletSession(ctx, request.cookies.get(walletCookie)?.value);
    return NextResponse.json(auth ? { address: auth.address, chainId: auth.chainId, expiresAt: auth.expiresAt, link: await walletProfile(ctx, auth.address) } : { address: null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error, 'PQ_WALLET_LOGIN'); }
}
