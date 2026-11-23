import { z } from 'zod';
import { isXAccountSource, X_QUEST } from './x-quest';
import { recordConditionsDiagnostic, plaintextConditionsMatch } from './conditions';
export const resolverSchema = z.object({ keyName: z.string(), parseType: z.string(), parsePath: z.string() }).strict();
export const attestationSchema = z.object({
  recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  request: z.object({ url: z.string().url(), header: z.string().max(16384), method: z.string(), body: z.string().max(16384) }).strict(),
  reponseResolve: z.array(resolverSchema).min(1).max(20),
  data: z.string().max(16384), attConditions: z.string().max(4096),
  timestamp: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  additionParams: z.string().max(4096),
  attestors: z.array(z.object({ attestorAddr: z.string(), url: z.string() }).strict()).max(10),
  signatures: z.array(z.string().regex(/^0x[0-9a-fA-F]{130}$/)).length(1),
}).strict();
export type Attestation = z.infer<typeof attestationSchema>;
export type Attempt = { recipient: string; challenge: string; createdAt: number; expiresAt: number };
export function matchesChallenge(actual: string, expected: string) {
  if (actual === expected) return true;
  // Primus' official SDK fixture includes algorithmType alongside application
  // context in signed additionParams. Compare context values, not JSON layout.
  // Signature verification must run on the ORIGINAL attestation before this.
  const schema = z.object({
    purpose: z.literal('proofquest-local-poc-v1'), questId: z.literal(X_QUEST.id),
    policyVersion: z.literal(1), nonce: z.string().regex(/^[0-9a-f]{64}$/),
    templateId: z.literal(X_QUEST.templateId), algorithmType: z.literal('proxytls').optional(),
  }).strict();
  try {
    const received = schema.safeParse(JSON.parse(actual));
    const requested = schema.safeParse(JSON.parse(expected));
    if (!received.success || !requested.success) return false;
    return received.data.purpose === requested.data.purpose &&
      received.data.questId === requested.data.questId &&
      received.data.policyVersion === requested.data.policyVersion &&
      received.data.templateId === requested.data.templateId &&
      received.data.nonce === requested.data.nonce;
  } catch { return false; }
}
export function checkBinding(att: Attestation, attempt: Attempt, now = Date.now()) {
  if (now > attempt.expiresAt) throw new Error('Attempt expired');
  if (att.recipient.toLowerCase() !== attempt.recipient.toLowerCase()) throw new Error('Recipient mismatch');
  if (!matchesChallenge(att.additionParams, attempt.challenge)) throw new Error('Challenge mismatch');
  if (att.timestamp < attempt.createdAt || att.timestamp > now + 30_000 || now - att.timestamp > 300_000) throw new Error('Proof freshness rejected');
}
export function checkQuest(att: Attestation) {
  if (!isXAccountSource(att.request.url) || att.request.method !== 'GET' || att.request.body !== '') throw new Error('Data source mismatch');
  // Marketplace does not expose parseType. Its bytes are signature-covered,
  // but its expected value is deliberately unpinned until genuine output review.
  if (att.reponseResolve.length !== 1 || att.reponseResolve[0].keyName !== X_QUEST.field || att.reponseResolve[0].parsePath !== X_QUEST.jsonPath) throw new Error('Template resolver mismatch');
  const plaintext = plaintextConditionsMatch(att.attConditions);
  recordConditionsDiagnostic(att.attConditions, plaintext);
  if (!plaintext) throw new Error('Unexpected conditions');
  const data = z.object({ screen_name: z.string().min(1).max(15).refine(value => !/[^A-Za-z0-9_]/.test(value)) }).strict().parse(JSON.parse(att.data));
  return data.screen_name;
}
