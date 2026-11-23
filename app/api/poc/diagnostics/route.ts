import { guard } from '../../../../lib/poc';
import { CONDITIONS_POLICY_REVISION, readConditionsDiagnostic } from '../../../../lib/conditions';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    guard(request);
    if (process.env.NODE_ENV !== 'development') return new Response(null, { status: 404 });
    return Response.json({ policyRevision: CONDITIONS_POLICY_REVISION, conditions: readConditionsDiagnostic() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return new Response(null, { status: 404 }); }
}
