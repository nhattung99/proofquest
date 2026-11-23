import { expect, it } from 'vitest';
import { diagnosticCode, friendlyError, serverProofCode } from '../lib/diagnostics';
it('surfaces numeric Primus codes and subcodes without raw account payloads', () => {
  const error = { code: '30001', subCode: '401', message: 'private-account-data', data: { cookie: 'private-cookie' } };
  expect(diagnosticCode(error)).toBe('30001:401');
  const output = friendlyError(error, 'primus-attestation');
  expect(output).toContain('X session expired');
  expect(output).toContain('primus-attestation');
  expect(output).not.toContain('private');
});
it('refuses arbitrary error strings and codes', () => {
  expect(friendlyError({ code: 'private-cookie', message: 'secret' }, 'server-verification')).not.toMatch(/private-cookie|secret/);
  expect(serverProofCode(new Error('private-data'))).toBe('PQ_PROOF_REJECTED');
});
it('distinguishes safe backend rejection reasons', () => {
  expect(serverProofCode(new Error('Challenge mismatch'))).toBe('PQ_CHALLENGE');
  expect(serverProofCode(new Error('Data source mismatch'))).toBe('PQ_SOURCE');
  expect(friendlyError({ code: 'PQ_CHALLENGE' }, 'server-verification')).toContain('challenge differs');
});
