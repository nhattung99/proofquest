import { createHash, randomBytes } from 'node:crypto';
import { PrimusZKTLS } from '@primuslabs/zktls-js-sdk';
import { z } from 'zod';
import { attestationSchema, checkBinding, checkQuest, type Attempt } from './policy';
import { X_QUEST } from './x-quest';
import { type VerificationContext } from './verification-context';
import { persistWalletLink, walletSession, type WalletSession } from './wallet-auth';
import { ServiceError } from './verification-store';
export { guard } from './verification-context';

export const cookieName = 'proofquest_poc';
export function configuration() {
  return z.object({ appId: z.string().min(1), appSecret: z.string().regex(/^0x[0-9a-fA-F]{64}$/), templateId: z.literal(X_QUEST.templateId), recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).parse({
    appId: process.env.PRIMUS_APP_ID, appSecret: process.env.PRIMUS_APP_SECRET,
    templateId: process.env.PRIMUS_TEMPLATE_ID, recipient: process.env.PRIMUS_RECIPIENT,
  });
}
export async function issueAttempt(ctx: VerificationContext, wallet?: WalletSession) {
  const config = configuration();
  const now = Date.now();
  const token = randomBytes(32).toString('hex');
  const sdk = new PrimusZKTLS();
  await sdk.init(config.appId, config.appSecret);
  const challenge = JSON.stringify({ purpose: 'proofquest-local-poc-v1', questId: X_QUEST.id, policyVersion: 1, nonce: randomBytes(32).toString('hex'), templateId: config.templateId });
  const recipient = wallet?.address ?? config.recipient;
  const request = sdk.generateRequestParams(config.templateId, recipient);
  request.setAdditionParams(challenge);
  request.setAttMode({ algorithmType: 'proxytls' });
  const signedRequest = await sdk.sign(request.toJsonString());
  await ctx.store.save(token, { recipient, challenge, createdAt: now, expiresAt: now + 300_000, sessionHash: ctx.sessionHash, ...(wallet ? { walletSessionId: wallet.id } : {}) });
  return { token, signedRequest };
}
export async function verifyAttempt(token: string, input: unknown, ctx: VerificationContext, walletToken = '') {
  const attempt = await ctx.store.take(token, ctx.sessionHash);
  if (!attempt) throw new Error('Unknown or already consumed attempt');
  const auth = attempt.walletSessionId ? await walletSession(ctx, walletToken) : null;
  if (attempt.walletSessionId && (!auth || auth.id !== attempt.walletSessionId || auth.address.toLowerCase() !== attempt.recipient.toLowerCase())) throw new ServiceError('PQ_WALLET_SESSION', 401);
  const result = verifyPayload(attempt, input);
  if (!auth) return result;
  await persistWalletLink(ctx, auth, { wallet: auth.address, screenName: result.screenName, attestationHash: result.attestationHash, timestamp: result.timestamp });
  return { ...result, walletAuthenticated: true, walletAddress: auth.address, walletBound: true };
}
export function verifyPayload(attempt: Attempt, input: unknown) {
  const attestation = attestationSchema.parse(input);
  if (new PrimusZKTLS().verifyAttestation(attestation) !== true) throw new Error('Invalid Primus signature');
  checkBinding(attestation, attempt);
  // Eligibility is mandatory. Authenticity alone must never display quest success.
  const screenName = checkQuest(attestation);
  // Fingerprint the verified payload and signature, not unsigned attestor metadata.
  const hash = createHash('sha256').update(JSON.stringify([
    attestation.recipient, attestation.request, attestation.reponseResolve,
    attestation.data, attestation.attConditions, attestation.timestamp,
    attestation.additionParams, attestation.signatures,
  ])).digest('hex');
  return { screenName, quest: X_QUEST.title, authenticity: true, attemptBinding: true, questPolicy: 'passed supported checks', resolverParseTypePinned: false, templateIdentity: 'request pinned; output has no template ID', walletAuthenticated: false, rewardsEnabled: false, timestamp: attestation.timestamp, attestationHash: `0x${hash}` };
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
