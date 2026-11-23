import { configuration, guard } from '../../../../lib/poc';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  if (process.env.VERCEL === '1' || !['localhost', '127.0.0.1'].includes(new URL(request.url).hostname)) {
    return Response.json({ code: 'PQ_LOCAL_ONLY' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    guard(request);
    const { appId, templateId, recipient } = configuration();
    return Response.json({ appId, templateId, recipient }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Local experiment needs configuration. Follow README.md and .env.example.' }, { status: 503 });
  }
}
