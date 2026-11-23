import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const loader = require('../scripts/primus-privacy-loader.cjs') as (this: { resourcePath: string }, source: string) => string;
describe('SDK build privacy filter', () => {
  it('removes logging and argument evaluation while preserving verification calls', () => {
    const output = loader.call({ resourcePath: 'index.js' }, 'console.log(attestation.data); const result = sdk.verifyAttestation(attestation);');
    expect(output).not.toContain('attestation.data');
    expect(output).toContain('sdk.verifyAttestation(attestation)');
  });
  it('strips all console calls from the installed SDK main module', () => {
    const source = readFileSync('node_modules/@primuslabs/zktls-js-sdk/dist/index.js', 'utf8');
    const output = loader.call({ resourcePath: 'index.js' }, source);
    expect(output).not.toMatch(/console\.(log|error|warn|time|timeEnd)\(/);
    expect(output).toContain('recoverAddress(encodeData, signature)');
  });
  it('disables optional diagnostics transport', () => {
    expect(loader.call({ resourcePath: '/dist/utils/eventReport.js' }, 'private diagnostics')).toBe('export function eventReport() { return Promise.resolve(); }');
  });
});
