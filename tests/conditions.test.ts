import { expect, it, vi } from 'vitest';
import { conditionsSummary, plaintextConditionsMatch, readConditionsDiagnostic, recordConditionsDiagnostic } from '../lib/conditions';
it.each(['', '[]', ' [ ] ', '[{"op":"REVEAL_STRING","field":"screen_name"}]', '[{"field":"$.screen_name","op":"REVEAL_STRING","value":""}]', '[[{"op":"REVEAL_STRING","field":"screen_name"}]]'])('accepts only plaintext representations: %s', value => expect(plaintextConditionsMatch(value)).toBe(true));
it.each(['{}', 'null', 'garbage', '[[]]', '[{"op":"SHA256","field":"screen_name"}]', '[{"op":"=","field":"screen_name","value":"alice"}]', '[{"op":"REVEAL_STRING","field":"other"}]', '[{"op":"REVEAL_STRING","field":"screen_name","value":"alice"}]', '[{"op":"REVEAL_STRING","field":"screen_name","extra":true}]', '[{"op":"REVEAL_STRING","field":"screen_name"},{"op":"REVEAL_STRING","field":"screen_name"}]'])('rejects mismatched conditions: %s', value => expect(plaintextConditionsMatch(value)).toBe(false));
it('does not expose condition values or arbitrary fields in diagnostics', () => {
  const summary = JSON.stringify(conditionsSummary('[{"op":"secret-op","field":"private-handle","value":"private-cookie"}]'));
  expect(summary).not.toMatch(/secret-op|private-handle|private-cookie/);
  expect(summary).toContain('redacted');
});
it('accepts official reveal_id metadata only for the approved screen_name', () => {
  expect(plaintextConditionsMatch('[{"op":"REVEAL_STRING","field":"$.screen_name","reveal_id":"screen_name"}]')).toBe(true);
  expect(plaintextConditionsMatch('[{"op":"REVEAL_STRING","field":"$.screen_name","reveal_id":"screen_name","type":"FIELD_REVEAL"}]')).toBe(true);
  expect(plaintextConditionsMatch('[{"op":"REVEAL_STRING","field":"$.screen_name","reveal_id":"other"}]')).toBe(false);
  expect(plaintextConditionsMatch('[{"op":"REVEAL_STRING","field":"$.screen_name","type":"FIELD_RANGE"}]')).toBe(false);
});
it('keeps diagnostics redacted and disables access in production', () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  try {
    vi.stubEnv('NODE_ENV', 'development');
    recordConditionsDiagnostic('[{"op":"=","field":"private-handle","value":"private-value"}]', false);
    expect(JSON.stringify(readConditionsDiagnostic())).not.toMatch(/private-handle|private-value/);
    vi.stubEnv('NODE_ENV', 'production');
    expect(readConditionsDiagnostic()).toBeNull();
    recordConditionsDiagnostic('private', false);
    expect(log).toHaveBeenCalledTimes(1);
  } finally { log.mockRestore(); vi.unstubAllEnvs(); }
});
