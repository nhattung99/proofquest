import { z } from 'zod';
import { X_QUEST } from './x-quest';
export const CONDITIONS_POLICY_REVISION = 'x-plaintext-reveal-metadata-v2';

const reveal = z.object({
  op: z.literal('REVEAL_STRING'),
  field: z.enum([X_QUEST.field, X_QUEST.jsonPath]),
  value: z.literal('').optional(),
  // Official core SDK assemblyResponse emits reveal_id from resolver.keyName.
  // It identifies the disclosed field; it must never point to another field.
  reveal_id: z.literal(X_QUEST.field).optional(),
  type: z.literal('FIELD_REVEAL').optional(),
}).strict();
// Primus can describe plaintext explicitly as REVEAL_STRING (official SDK
// test/index.test.ts). Hash/comparison proofs are NOT plaintext ownership data.
export function plaintextConditionsMatch(serialized: string) {
  if (serialized.trim() === '') return true;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return false;
    if (parsed.length === 0) return true;
    const flat = parsed.length === 1 && Array.isArray(parsed[0]) ? parsed[0] : parsed;
    return flat.length === 1 && reveal.safeParse(flat[0]).success;
  } catch { return false; }
}

// A safe diagnostic projection, never the raw string or condition values.
export function conditionsSummary(serialized: string) {
  try {
    const parsed: unknown = serialized.trim() ? JSON.parse(serialized) : [];
    if (!Array.isArray(parsed)) return { shape: parsed === null ? 'null' : typeof parsed, knownKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed).filter(key => ['conditions', 'screen_name', 'op', 'field', 'value'].includes(key)) : [] };
    const nested = parsed.length === 1 && Array.isArray(parsed[0]);
    const list: unknown[] = nested ? parsed[0] : parsed;
    return { shape: nested ? 'nested-array' : 'array', count: list.length, items: list.slice(0, 4).map(item => {
      const value = item as Record<string, unknown> | null;
      return {
        op: ['REVEAL_STRING', 'SHA256', '>', '<', '=', '>=', '<=', '!='].includes(String(value?.op)) ? value?.op : 'OTHER',
        field: value?.field === X_QUEST.field || value?.field === X_QUEST.jsonPath ? value.field : 'OTHER',
        revealId: value?.reveal_id === undefined ? 'absent' : value.reveal_id === X_QUEST.field ? X_QUEST.field : 'OTHER',
        conditionType: value?.type === undefined ? 'absent' : value.type === 'FIELD_REVEAL' ? 'FIELD_REVEAL' : 'OTHER',
        value: value?.value === undefined ? 'absent' : value.value === null ? 'null' : value.value === '' ? 'empty' : 'redacted',
        valueType: value?.value === null ? 'null' : typeof value?.value,
        knownKeys: value && typeof value === 'object' ? Object.keys(value).filter(key => ['op', 'field', 'value', 'result', 'type', 'keyName', 'parsePath', 'reveal_id'].includes(key)) : [],
        unknownKeyCount: value && typeof value === 'object' ? Object.keys(value).filter(key => !['op', 'field', 'value', 'result', 'type', 'keyName', 'parsePath', 'reveal_id'].includes(key)).length : 0,
      };
    }) };
  } catch { return { shape: 'invalid-json' }; }
}

type ConditionDiagnostic = { revision: string; observedAt: string; actual: ReturnType<typeof conditionsSummary>; accepted: boolean; expected: string };
const state = globalThis as typeof globalThis & { proofquestConditionsDiagnostic?: ConditionDiagnostic };
export function recordConditionsDiagnostic(serialized: string, accepted: boolean) {
  if (process.env.NODE_ENV !== 'development') return;
  const diagnostic = { revision: CONDITIONS_POLICY_REVISION, observedAt: new Date().toISOString(), actual: conditionsSummary(serialized), accepted, expected: 'empty or one REVEAL_STRING on screen_name / $.screen_name; optional reveal_id=screen_name, type=FIELD_REVEAL; absent/empty value' };
  state.proofquestConditionsDiagnostic = diagnostic;
  console.info('[ProofQuest conditions]', JSON.stringify(diagnostic));
}
export function readConditionsDiagnostic() { return process.env.NODE_ENV === 'development' ? state.proofquestConditionsDiagnostic ?? null : null; }
