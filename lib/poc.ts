import { createHash, randomBytes } from 'node:crypto';
import { PrimusZKTLS } from '@primuslabs/zktls-js-sdk';
import { z } from 'zod';
import { attestationSchema, checkBinding, checkQuest, type Attempt } from './policy';
import { X_QUEST } from './x-quest';

// Deliberately single-process and localhost-only. Replace with durable authenticated
// attempts and atomic claims before any public release. Never awards rewards.
const state = globalThis as typeof globalThis & { proofquestAttempts?: Map<string, Attempt>; proofquestLastIssue?: number };
const attempts = state.proofquestAttempts ??= new Map();
export const cookieName = 'proofquest_poc';
export function cancelAttempt(token: string) { attempts.delete(token); }
export function guard(request: Request) {
  if (process.env.VERCEL === '1') throw new Error('Public preview only');
  const url = new URL(request.url);
  const host = request.headers.get('host') ?? '';
  // Next may normalize the internal URL to localhost even for a 127.0.0.1 Host.
  if (!/^(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$/.test(host)) throw new Error('Local experiment only');
  const publicUrl = new URL(`${url.protocol}//${host}`);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || publicUrl.port !== url.port) throw new Error('Local experiment only');
  if (request.method !== 'GET' && request.headers.get('origin') !== publicUrl.origin) throw new Error('Origin rejected');
  if (process.env.PROOFQUEST_POC_ENABLED !== 'true') throw new Error('Enable local experiment in .env.local');
}
export function configuration() {
  return z.object({ appId: z.string().min(1), appSecret: z.string().regex(/^0x[0-9a-fA-F]{64}$/), templateId: z.literal(X_QUEST.templateId), recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).parse({
    appId: process.env.PRIMUS_APP_ID, appSecret: process.env.PRIMUS_APP_SECRET,
    templateId: process.env.PRIMUS_TEMPLATE_ID, recipient: process.env.PRIMUS_RECIPIENT,
  });
}
export async function issueAttempt() {
  const config = configuration();
  const now = Date.now();
  for (const [key, attempt] of attempts) if (attempt.expiresAt < now) attempts.delete(key);
  if (now - (state.proofquestLastIssue ?? 0) < 30_000 || attempts.size >= 10) throw new Error('Wait 30 seconds before starting another attempt');
  state.proofquestLastIssue = now;
  const token = randomBytes(32).toString('hex');
  const sdk = new PrimusZKTLS();
  await sdk.init(config.appId, config.appSecret);
  const challenge = JSON.stringify({ purpose: 'proofquest-local-poc-v1', questId: X_QUEST.id, policyVersion: 1, nonce: randomBytes(32).toString('hex'), templateId: config.templateId });
  const request = sdk.generateRequestParams(config.templateId, config.recipient);
  request.setAdditionParams(challenge);
  request.setAttMode({ algorithmType: 'proxytls' });
  const signedRequest = await sdk.sign(request.toJsonString());
  attempts.set(token, { recipient: config.recipient, challenge, createdAt: now, expiresAt: now + 300_000 });
  return { token, signedRequest };
}
export function verifyAttempt(token: string, input: unknown) {
  const attempt = attempts.get(token);
  if (!attempt) throw new Error('Unknown or already consumed attempt');
  // Synchronous consume before validation prevents concurrent reuse in this process.
  attempts.delete(token);
  const attestation = attestationSchema.parse(input);
  if (new PrimusZKTLS().verifyAttestation(attestation) !== true) throw new Error('Invalid Primus signature');
  checkBinding(attestation, attempt);
  // Eligibility is mandatory. Authenticity alone must never display quest success.
  checkQuest(attestation);
  // Fingerprint the verified payload and signature, not unsigned attestor metadata.
  const hash = createHash('sha256').update(JSON.stringify([
    attestation.recipient, attestation.request, attestation.reponseResolve,
    attestation.data, attestation.attConditions, attestation.timestamp,
    attestation.additionParams, attestation.signatures,
  ])).digest('hex');
  return { quest: X_QUEST.title, authenticity: true, attemptBinding: true, questPolicy: 'passed supported checks', resolverParseTypePinned: false, templateIdentity: 'request pinned; output has no template ID', walletAuthenticated: false, rewardsEnabled: false, timestamp: attestation.timestamp, attestationHash: `0x${hash}` };
}
export async function readLimitedJson(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Expected JSON');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Expected body');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 65536) throw new Error('Payload too large');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
