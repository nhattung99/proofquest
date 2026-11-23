# Test plan and evidence

Challenge serialization follow-up: 50 unit tests pass, including JSON key-order/whitespace and optional signed proxytls metadata, with changed nonce/quest/template/policy, missing nonce, unexpected metadata and alternate algorithms rejected. Typecheck and lint passed. Live user screenshot indicates backend signature acceptance followed by challenge rejection; full real proof acceptance remains pending. No proof data was logged or persisted.

2026-11-15 troubleshooting update: 41 unit tests passed, including sanitization of Primus numeric codes/subcodes and backend failure categories. Local loopback-host regression is covered. The UI now reports the failed stage and sanitized code rather than discarding backend/SDK distinctions. No raw error messages, X fields or cookies are displayed. Genuine attestation failure remains undiagnosed until a new browser attempt supplies that safe code; no signature or claim checks were relaxed.

Automated tests distinguish synthetic fixtures from real proofs. Vitest covers freshness, recipient/challenge binding, source/resolver mismatch, malformed input, screen-name eligibility, invalid official signature rejection, local isolation, server signing and consumed attempts. The synthetic application key in tests is disposable test material, never a wallet or live Primus project credential.

Playwright covers fail-closed unconfigured startup, responsive width, missing extension via a mocked config response (not a simulated proof), and refused API requests. Tests do not fabricate a successful Primus attestation.

Wallet authentication, database concurrency, points/badges and profile-update tests belong to later phases; these features are not implemented. Real proof generation is a required manual acceptance test using the integration checklist. It has NOT been run because project credentials/extension and template configuration are not available.

Command outcomes are recorded below after execution. A production build alone does not establish zkTLS success.

2026-10-28: lint and TypeScript passed; Vitest passed 19/19 tests. Production webpack build passed with all four application routes generated. A subsequent sandboxed build encountered Windows EPERM while creating a generated directory; rerunning outside the restricted sandbox passed. Browser run initially passed 2/3; the missing-extension assertion matched Next.js's development-tools button as well as the app button, so its selector was corrected to the named proof button. Final browser rerun: **3/3 passed**. Lint and TypeScript also passed after the selector change.

Dependency audit is not clean: after patching transitive ws via a compatible 8.x override, 19 low/moderate findings remain in the official SDK dependency tree. See SECURITY.md.


Confirmed-X update: 37/37 Vitest tests and 4/4 Playwright tests passed. Coverage adds endpoint boundary rejection, malformed screen names, deliberately unpinned parseType, privacy loader transformation and browser confirmation that SDK initialization payload logging is suppressed. The browser privacy check uses only a synthetic initialization transport, not a fake successful proof. No real Primus proof or production wallet/reward protection has been validated.


2026-11-23 fix/polish: lint/typecheck passed, 68 Vitest tests passed, 8 development and 8 production-mode Playwright fixtures passed, Next 16.4.6 production build passed. Desktop/mobile screenshots reviewed. The user reported two real PQ_CONDITIONS failures, so full real-proof acceptance remains unresolved. Further safe diagnostics require a fresh attempt on the current dev server. See FIX_AND_POLISH.md for exact scope and evidence. UI fixture screenshots and mocked transport errors are not genuine proof evidence.


Live resolution on 2026-11-23: v2 diagnostics showed REVEAL_STRING, field $.screen_name, reveal_id screen_name, absent value, no unknown properties, accepted=true at 18:24:05 Asia/Saigon. The following POST /api/poc/verify returned HTTP 200. This is genuine user-run backend proof acceptance, not a synthetic test. The previously unresolved reports are historical; the missing reveal_id allowlist caused rejection. 69 unit tests and 9 development browser tests passed. Reload-interruption recovery is covered. Wallet authentication and durable replay/cross-user claims remain unvalidated and rewards disabled.


Final confirmation: the user observed the genuine green VERIFIED badge, all four journey ticks and SHA-256 receipt at 18:24:04 Asia/Saigon on 2026-11-23, matching the live backend HTTP 200. No PQ_CONDITIONS or silent reset occurred on that run. Final production build passed and production browser fixtures passed 9/9. These UI fixtures remain distinct from the separate genuine user confirmation. No real replay/cross-wallet negative test has been claimed.


Public verification preparation (not deployed): lint/typecheck passed; 78 unit, public-route and storage-contract tests passed; 12 local production Playwright tests passed. Direct localhost HTTP session tests rejected cross-session use, malformed proof and consumed replay. The current Primus appSecret was not found in scanned client chunks. No new actual Redis or public Primus E2E test was run: storage credentials and deployment approval are pending. The attestation policy itself was not changed. See PUBLIC_VERIFICATION.md for the exact setup and required live checks.
