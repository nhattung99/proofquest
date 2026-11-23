# Fix and polish report — 2026-11-23

## Current result

The one-page UI and Next.js 16.4.6 patch are implemented. **A genuine Primus X proof passed backend verification on 2026-11-23 at 18:24:05 Asia/Saigon.** The development log records accepted conditions under revision x-plaintext-reveal-metadata-v2 followed by POST /api/poc/verify HTTP 200. The response is produced only after official signature verification, freshness/recipient/challenge binding, approved source/resolver, plaintext conditions and screen_name syntax checks. No account value or raw proof was retained. The user independently confirmed the green VERIFIED badge, receipt and all four journey checkpoints, with no PQ_CONDITIONS or silent reset on that run. No fake success screenshot is supplied.

## Conditions investigation

Original policy accepted only the literal empty string or `[]`. That is too narrow: the official SDK fixture at inspected revision 0265962b1d4b8e9db56ff7b1e9120a0ad5235978, test/index.test.ts, includes explicit plaintext REVEAL_STRING conditions. The new policy parses JSON and permits no conditions or exactly one REVEAL_STRING on screen_name / $.screen_name, with absent or empty value. One URL-group nesting is supported; SHA256, comparisons, unexpected fields/properties, multiple conditions and nonempty comparison values are refused. The original attestation bytes remain unchanged for official signature verification.

The actual signed condition summary from the genuine run is one REVEAL_STRING for $.screen_name, no value, and reveal_id=screen_name. The initial literal-empty check rejected all explicit reveal conditions; the first strict reveal schema then still rejected the additional reveal_id property. The official core SDK assemblyResponse (src/assembly_params.ts at inspected revision 24b1944f1c53154420649ae9cbe13865d41ab6de) emits reveal_id from resolver.keyName. Final policy validates this metadata as the literal screen_name, not arbitrary passthrough. Optional type must be FIELD_REVEAL. Wrong reveal IDs/types, hashes, comparisons and unknown properties remain rejected. The genuine v2 run accepted the exact observed structure and the server returned HTTP 200.

Developer-only diagnostics log an allowlisted projection: array shape/count, recognized operators/field names, reveal ID/type only when approved, and value presence/type with values redacted. No username, password, cookie, raw proof, arbitrary field names or appSecret is logged. GET /api/poc/diagnostics exposes only the latest redacted summary on localhost development after signature/source/binding checks. It returns 404 in production.

Credentials are left in .env.local and not printed. appId validity and template execution are distinct; no undocumented requirement that a public Marketplace template be owned by the app is introduced.

## How to test the real flow

1. Leave existing correct local credentials in place. Run/open development http://127.0.0.1:3000 in the browser with Primus installed. Use Ctrl+Shift+R once after server compilation.
2. The extension pill should say detected. Click Generate real proof and complete X login in Primus. No wallet transaction is needed.
3. On PQ_CONDITIONS, tell the developer the attempt finished; the developer can inspect /api/poc/diagnostics without asking for account data. The endpoint contains no raw proof. The confirmed v2 success uses reveal_id=screen_name; compare any new mismatch with the policy before changing it.
4. A genuine success must pass both official browser and server signature verification, attempt binding, source, field/path, plaintext conditions and username syntax. Only then does the server produce an attestation fingerprint and timestamp receipt.
5. Test cancellation, expired attempts, nonce/recipient mismatches and reuse before enabling any valuable claims. Wallet authentication and durable cross-user protection are still absent. Rewards stay disabled.

## Automated and visual evidence

- Lint and TypeScript: passed.
- Vitest: 69 tests passed, including plaintext-vs-hash conditions, privacy diagnostics, challenge/recipient binding and cancelled-attempt invalidation.
- Playwright development fixtures: 9/9 passed, including reload-interruption recovery.
- Next.js 16.4.6 production webpack build: passed using .next-production, separately from live dev.
- Playwright final production fixtures: 9/9 passed, including reload-interruption recovery.
- Production homepage HTTP 200; dev diagnostics HTTP 404; no advisory text in captured production startup; no Next dev-tools badge in production screenshot.
- Desktop 1438x789: primary button above fold. Mobile 390px: no horizontal overflow. Screenshots visually reviewed at artifacts/proofquest-desktop.png and artifacts/proofquest-mobile.png (production-mode fixtures).
- The screenshots use synthetic extension initialization, not a generated proof. No successful attestation is mocked or presented as genuine evidence. Successful live backend acceptance is established by the separate real-user run and HTTP 200, not the screenshots.
- npm audit after patch: no Next entry, no high/critical findings; 26 low/moderate dependency findings remain. No blanket force-upgrade performed.

## Files changed

- lib/conditions.ts — explicit plaintext semantics and redacted development diagnostics.
- lib/policy.ts — apply condition policy after existing signed source/resolver checks.
- lib/poc.ts — server-gated attestation fingerprint receipt and one-time attempt cancellation.
- app/api/poc/cancel/route.ts — revoke the current local attempt and clear its cookie.
- app/api/poc/diagnostics/route.ts — localhost/dev-only safe condition summary, disabled in production.
- lib/diagnostics.ts — keep safe error wording separate from the one consistent rewards notice.
- lib/presentation.ts — shared extension link and rewards wording.
- app/proof-experiment.tsx — retain official SDK flow; add extension detection, honest progress checkpoints, local cancellation, dismissible errors, copying, receipt, header/footer, hero diagram, FAQ and hidden technical details.
- app/style.css — orange/black visual polish, responsive first-screen fit, focus states, motion preferences and explicit list/text layout resets.
- next.config.ts — allow separate production output without interrupting live development; retain SDK privacy loader.
- package.json / package-lock.json — Next and matching ESLint config 16.4.6; no new dependencies.
- playwright.config.ts — isolated default port and optional external dev/production URL.
- tests/conditions.test.ts — reveal condition policy and dev-only privacy regression tests.
- tests/poc.test.ts — actual cancelled-attempt invalidation test.
- tests/browser/poc.spec.ts — deterministic config fixtures and scoped status selectors.
- tests/browser/polish.spec.ts — desktop/mobile, error dismissal/retry/copy presence, cancellation and screenshots.
- tsconfig.json / next-env.d.ts — Next-generated production output type references.
- .gitignore — ignore production QA output and screenshot artifacts.
- .env.example — remove the deleted appId default; local secrets preserved.
- README.md, docs/TESTING.md, docs/SECURITY.md, docs/PRIMUS_INTEGRATION.md, docs/FIX_AND_POLISH.md — current behavior, evidence and unresolved live-proof gate.

## Limits

Cancel invalidates the current attempt and ignores late results, then asks the SDK to close its data-source tab. The SDK offers no confirmed protocol-abort API; another attempt is blocked until the pending SDK operation ends. Cancellation cannot retract a proof that the server already accepted, though no reward/claim persistence exists.

Progress reflects real observable SDK checkpoints. X connection and proof generation are grouped because the SDK does not expose a reliable separate login-complete event. The receipt is a SHA-256 fingerprint of verified payload/signature serialization, not a blockchain transaction hash. A username is mutable; wallet authentication, stable-identity policies and durable replay/atomic claims remain release gates. Expected parseType and explicit template-ID output remain unverified as documented earlier.

Nothing was deployed or pushed.


## Reload-interruption hardening

The user reported one silent reset while development code was being edited/recompiled. Its exact cause was not established. The UI now keeps only a non-sensitive pending-run flag in sessionStorage, removes it on a finished run, and surfaces PQ_INTERRUPTED after an interrupted page reload. It does not store the proof, account name, token or credentials. This recovery path is browser-tested; it is not claimed to prove the cause of the earlier silent reset.


## Genuine proof receipt (user-confirmed)

- Fingerprint, SHA-256: `0xb493678f383df4a0aa0c94f47b74182ce0173d238571245c4ff86ed1fd39d27e`.
- Attested timestamp displayed: 2026-11-23 18:24:04 Asia/Saigon.
- Backend accepted conditions / HTTP 200: 18:24:05 Asia/Saigon, policy x-plaintext-reveal-metadata-v2.
- User confirmed green VERIFIED, Your X ownership proof passed, all four journey steps completed, and receipt notice that wallet ownership is not authenticated and claims remain disabled.
- The supplied fingerprint is a receipt identifier, not the raw proof or a blockchain transaction. No username or X credentials are recorded here.

Final verification: Next.js 16.4.6 production build passed; all 9 production browser fixtures passed. Local production preview: http://127.0.0.1:3200. Development: http://127.0.0.1:3000. No deployment or push.
