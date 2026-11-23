// Never display arbitrary SDK/server messages: they may contain account data.
const safeMessages: Record<string, string> = {
  PQ_WALLET_LOGIN: 'Wallet sign-in failed. Unlock MetaMask and request a new sign-in message.',
  PQ_WALLET_NONCE: 'This sign-in request expired or was already used. Sign in again.',
  PQ_WALLET_SIGNATURE: 'The wallet signature did not match this sign-in request. Select the intended account and sign in again.',
  PQ_WALLET_SESSION: 'Your wallet session changed or expired. Sign in again, then generate a new X binding proof.',
  PQ_BIND_CONFLICT: 'This wallet or X screen name already has a different binding. No existing binding was overwritten. Contact support to review it.',
  PQ_REPLAY: 'This proof was already used for binding. Generate a new proof.',
  PQ_CONFIG: 'Verification is not configured yet. Please contact the developer.',
  PQ_SESSION: 'Your verification session expired. Reload the page and try again.',
  PQ_ORIGIN: 'Verification must be started on the configured ProofQuest website.',
  PQ_STORAGE: 'Verification service is temporarily unavailable. Please try again later.',
  PQ_RATE_LIMIT: 'Too many attempts. Please wait before trying again; the temporary request limit protects the service. The countdown shows when you can retry.',
  PQ_EXTENSION_LAUNCH: 'Primus did not respond within 15 seconds. Enable the extension for this website, close any existing Primus flow, then reset the connection and try again in Chrome or Edge.',
  '00003': 'Primus still has a verification in progress. Close its existing tab, then reset the connection before retrying.',
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
  PQ_REQUEST_REJECTED: 'Server refused the request. Please wait 30 seconds and try again, or contact the developer.',
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
