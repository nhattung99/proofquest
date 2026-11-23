// Never display arbitrary SDK/server messages: they may contain account data.
const safeMessages: Record<string, string> = {
  PQ_LOCAL_ONLY: 'Public preview. Real verification is available in the local builder environment; public claims are disabled.',
  '00006': 'Primus extension is missing. Install it, enable it, then reload.',
  '00004': 'Verification cancelled. You can start a new attempt.',
  '00012': 'Template unavailable. Confirm its ID and access in Developer Hub.',
  '00002': 'Primus verification timed out. Reload before retrying.',
  '00013': 'No verifiable account data detected. Check X login in the Primus flow.',
  '00014': 'Verification connection interrupted. Reload before retrying.',
  '-1002001': 'Primus app ID is invalid. Check your new project credentials.',
  '-1002002': 'Primus app secret is invalid. Check it locally; do not share it.',
  '-1002003': 'Primus trial proof quota is exhausted. Check Developer Hub.',
  '-1002004': 'Primus subscription has expired. Check Developer Hub.',
  '-1002005': 'Primus proof quota is exhausted. Check Developer Hub.',
  '30001:401': 'X session expired. Sign in again through Primus.',
  '30001:403': 'X blocked the request. Wait before retrying.',
  '30001:429': 'X rate limit reached. Wait before retrying.',
  '30004': 'Primus could not parse the X response. Check login and template availability.',
  PQ_REQUEST_REJECTED: 'Server refused the request. Check local configuration and wait 30 seconds before retrying.',
  PQ_PROOF_REJECTED: 'Server rejected the proof.',
  PQ_PAYLOAD: 'Attestation shape was rejected. Do not share the raw proof.',
  PQ_SIGNATURE: 'Official Primus signature verification failed.',
  PQ_ATTEMPT: 'Attempt is unknown or already consumed. Reload and create a new attempt.',
  PQ_EXPIRED: 'Attempt or proof expired. Start a new attempt and finish within five minutes.',
  PQ_RECIPIENT: 'Proof recipient differs from the verification attempt.',
  PQ_CHALLENGE: 'Signed proof challenge differs from the verification attempt.',
  PQ_SOURCE: 'Signed source endpoint, method, or body differs from the approved X quest.',
  PQ_RESOLVER: 'Signed extracted field or JSONPath differs from the approved X quest.',
  PQ_CONDITIONS: 'Signed conditions differ from the expected plaintext result.',
  PQ_INTERRUPTED: 'The page reloaded before verification finished. Start a new attempt.',
  PQ_TIMEOUT: 'Verification stopped responding. Close the Primus flow and reload before retrying.',
};
export function diagnosticCode(error: unknown): string {
  const value = error as { code?: unknown; subCode?: unknown; errorData?: { code?: unknown } } | null;
  const raw = value?.code ?? value?.errorData?.code;
  if (typeof raw !== 'string' && typeof raw !== 'number') return 'unknown';
  const code = String(raw);
  if (Object.hasOwn(safeMessages, code)) return code;
  if (!/^-?\d{1,8}(?::\d{1,6})?$/.test(code)) return 'unknown';
  const sub = value?.subCode;
  return (typeof sub === 'number' || typeof sub === 'string') && /^\d{1,6}$/.test(String(sub)) && !code.includes(':') ? `${code}:${sub}` : code;
}
export function friendlyError(error: unknown, stage: string) {
  const code = diagnosticCode(error);
  const message = safeMessages[code] ?? safeMessages[code.split(':')[0]] ?? 'Verification failed. Retry after checking extension access and connection.';
  return `${message} [stage: ${stage}; code: ${code}]`;
}
export function serverProofCode(error: unknown) {
  const value = error as { name?: string; message?: string };
  if (value?.name === 'ZodError' || value?.name === 'SyntaxError') return 'PQ_PAYLOAD';
  const codes: Record<string, string> = {
    'Unknown or already consumed attempt': 'PQ_ATTEMPT',
    'Invalid Primus signature': 'PQ_SIGNATURE',
    'Attempt expired': 'PQ_EXPIRED', 'Proof freshness rejected': 'PQ_EXPIRED',
    'Recipient mismatch': 'PQ_RECIPIENT', 'Challenge mismatch': 'PQ_CHALLENGE',
    'Data source mismatch': 'PQ_SOURCE', 'Template resolver mismatch': 'PQ_RESOLVER',
    'Unexpected conditions': 'PQ_CONDITIONS',
  };
  return codes[value?.message ?? ''] ?? 'PQ_PROOF_REJECTED';
}
