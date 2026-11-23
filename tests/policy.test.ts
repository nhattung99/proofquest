import { describe, expect, it } from 'vitest';
import { PrimusZKTLS } from '@primuslabs/zktls-js-sdk';
import { attestationSchema, checkBinding, checkQuest, matchesChallenge, type Attestation } from '../lib/policy';
const now = 1_800_000_000_000;
const resolver = [{ keyName: 'screen_name', parseType: 'json', parsePath: '$.screen_name' }];
// Synthetic fixture, NOT a genuine Primus proof.
const att: Attestation = {
  recipient: '0x1111111111111111111111111111111111111111',
  request: { url: 'https://api.x.com/1.1/account/settings.json', method: 'GET', header: '', body: '' },
  reponseResolve: resolver, data: '{"screen_name":"alice"}', attConditions: '[]',
  timestamp: now, additionParams: 'challenge', attestors: [], signatures: [`0x${'00'.repeat(65)}`],
};
const attempt = { recipient: att.recipient, challenge: 'challenge', createdAt: now - 1000, expiresAt: now + 1000 };
describe('attempt binding and quest policy (synthetic fixtures)', () => {
  const context = { purpose: 'proofquest-local-poc-v1', questId: 'verify-x-account', policyVersion: 1, nonce: 'ab'.repeat(32), templateId: '2e3160ae-8b1e-45e3-8c59-426366278b9d' };
  it('accepts JSON reordering and signed proxytls metadata while preserving context', () => {
    expect(matchesChallenge(JSON.stringify({ algorithmType: 'proxytls', ...Object.fromEntries(Object.entries(context).reverse()) }, null, 2), JSON.stringify(context))).toBe(true);
  });
  it.each([
    { nonce: 'cd'.repeat(32) }, { questId: 'another-quest' },
    { templateId: 'another-template' }, { policyVersion: 2 },
    { algorithmType: 'mpctls' }, { unexpected: true }, { nonce: undefined },
  ])('rejects changed or missing challenge context: %j', change => {
    expect(matchesChallenge(JSON.stringify({ ...context, ...change }), JSON.stringify(context))).toBe(false);
  });
  it('rejects missing or invalid serialized challenge', () => {
    expect(matchesChallenge('', JSON.stringify(context))).toBe(false);
    expect(matchesChallenge('{}', JSON.stringify(context))).toBe(false);
    expect(matchesChallenge('not-json', JSON.stringify(context))).toBe(false);
  });
  it('accepts fresh matching context', () => expect(() => checkBinding(att, attempt, now)).not.toThrow());
  it.each([
    ['recipient', { recipient: '0x2222222222222222222222222222222222222222' }],
    ['challenge', { additionParams: 'another' }],
    ['stale proof', { timestamp: now - 301_000 }],
    ['future proof', { timestamp: now + 31_000 }],
    ['proof predating attempt', { timestamp: now - 2000 }],
  ])('rejects %s', (_, change) => expect(() => checkBinding({ ...att, ...change }, attempt, now)).toThrow());
  it('rejects expired attempts', () => expect(() => checkBinding(att, attempt, now + 1001)).toThrow());
  it('accepts screen-name eligibility with exact source/resolver', () => expect(checkQuest(att)).toBe('alice'));
  it('rejects wrong source', () => expect(() => checkQuest({ ...att, request: { ...att.request, url: 'https://other.example/' } })).toThrow());
  it('rejects wrong template semantics', () => expect(() => checkQuest({ ...att, reponseResolve: [{ ...resolver[0], parsePath: '$.other' }] })).toThrow());
  it('rejects unexpected privacy conditions', () => expect(() => checkQuest({ ...att, attConditions: '[{"op":"SHA256"}]' })).toThrow());
  it('rejects absent username', () => expect(() => checkQuest({ ...att, data: '{}' })).toThrow());
  it.each(['', 'has space', '@alice', 'a'.repeat(16), 'alice\n'])('rejects invalid screen_name %j', screen_name => expect(() => checkQuest({ ...att, data: JSON.stringify({ screen_name }) })).toThrow());
  it('does not guess parseType', () => expect(checkQuest({ ...att, reponseResolve: [{ ...resolver[0], parseType: 'unconfirmed' }] })).toBe('alice'));
  it('rejects malformed input', () => expect(attestationSchema.safeParse({ success: true }).success).toBe(false));
  it('official verifier rejects an invalid signature without mocking it', () => {
    expect(() => new PrimusZKTLS().verifyAttestation(att)).toThrow();
  });
});
