> Current wallet feature: MetaMask SIWE login and verified X screen-name binding are documented in [WALLET_BINDING.md](WALLET_BINDING.md). Earlier wallet-disabled notes below describe historical releases. Rewards remain disabled.

# Public X verification — deployed

Public verification is enabled at https://proofquest-nu.vercel.app after the owner's explicit push/deploy approval. Application commit e114cff passed CI and Vercel reached READY. Live Redis/session/rate-limit checks passed, and the user confirmed a genuine public X VERIFIED receipt. Further main-branch pushes auto-deploy, so release changes still require owner authorization.

## Required Vercel configuration

In Vercel → ProofQuest → Settings → Environment Variables, configure these for **Production**. Use server variables only; never add NEXT_PUBLIC_ prefixes. Copy credentials directly from the existing correct project/local file into the dashboard; do not paste secrets into chat.

| Variable | Required | Used by / purpose | Secret? |
|---|---|---|---|
| PROOFQUEST_PUBLIC_VERIFICATION_ENABLED | Yes, enabled for public verification | verificationMode in lib/verification-context.ts; explicitly selects public mode | No |
| PROOFQUEST_PUBLIC_ORIGIN | Yes | allowedOrigin / guard; exact HTTPS origin of proofquest-nu.vercel.app, without trailing slash; protects session/sign/verify/cancel from cross-origin use | No |
| PRIMUS_APP_ID | Yes | configuration / SDK init; must be from the current active ProofQuest project | No |
| PRIMUS_APP_SECRET | Yes | official server init/sign; also domain-separated HMAC for session/IP identifiers in storage | Yes |
| PRIMUS_TEMPLATE_ID | Yes | pins the already confirmed Account Ownership (X) Marketplace template | No |
| PRIMUS_RECIPIENT | Yes | EVM-format receipt recipient used by the existing workflow; this is a configured project identifier, not proof that a reviewer owns that wallet | Public identifier |
| UPSTASH_REDIS_REST_URL | Yes | Redis REST endpoint for shared attempts and rate counters | Server configuration |
| UPSTASH_REDIS_REST_TOKEN | Yes | normal read/write Redis REST token (not the readonly token); authorizes SET/EVAL operations | Yes |

PROOFQUEST_POC_ENABLED is for local development only and is not required on Vercel. PROOFQUEST_DIST_DIR is for local production QA and should be left unset on Vercel. VERCEL and NODE_ENV are platform-provided; do not create manual overrides. No separate frontend signing key or NEXT_PUBLIC secret is needed.

Keep the existing public origin canonical: https://proofquest-nu.vercel.app. Other preview/branch/deployment domains deliberately fail origin checks unless a separate environment is configured for that exact domain. Do not share production credentials across an arbitrary wildcard allowlist.

## Shared Redis setup

Create/select a dedicated Upstash Redis database in the Upstash console. Copy its HTTPS REST endpoint and standard read/write token from its connection/REST section into the two Vercel variables above. No new npm dependency is required: the server uses the documented JSON command-over-HTTP API with Bearer authorization. Do not use the TCP endpoint or readonly token.

Sources: [Upstash REST API](https://upstash.com/docs/redis/features/restapi), [Vercel request headers](https://vercel.com/docs/headers/request-headers).

Attempts expire in five minutes. Stored data contains recipient, random challenge, creation/expiry times and a session HMAC. It contains no X username, raw attestation, password or cookie. Rate-counter keys use keyed HMAC identifiers instead of raw IP/session strings, with one-hour expiry. Do not expose the Redis token to the browser.

## Security and serverless behavior

- Config creates an unpredictable HttpOnly/SameSite=Strict session cookie; public cookies are Secure and scoped to the API path.
- The server constructs the fixed-template request, embeds the fresh random challenge and signs with the official SDK. Arbitrary client signing parameters are not accepted.
- The attempt is stored in shared Redis. Verification uses one atomic Lua operation that compares session ownership and deletes the attempt before returning it. A different session cannot consume/burn it. All Vercel instances use the same REST database and namespace.
- The original passing signature, source, resolver field/path, conditions, freshness, recipient and challenge checks are preserved. No proof-validation rule was relaxed.
- Request and verify endpoints enforce exact configured host/Origin. Cross-site browser requests are rejected. Rate limiting uses Vercel's platform x-vercel-forwarded-for header, not client x-forwarded-for; missing platform identity fails closed on Vercel.
- Per session/IP per hour: signing 5/15; verification 30/60; cancellation 30/60; configuration 120/120. Signing also has a 30-second per-session cooldown. 429 responses carry Retry-After and a safe friendly code.
- Redis failure or missing credentials fails closed with a service/configuration error. There is no public in-memory fallback. Local development alone uses an in-memory adapter.
- Anonymous browser-session binding is not wallet authentication or unique-human identity. The configured PRIMUS_RECIPIENT is not asserted to be the reviewer's wallet. Rewards and claims stay disabled. Rate limits are lightweight quota protection, not a complete anti-bot solution.

## Primus dashboard

Keep the current active ProofQuest project and its matching appId/appSecret. Keep the confirmed Marketplace X template unchanged: no new resolver, parseType, template export or custom X endpoint is needed.

The inspected official SDK and production example do not require a localhost domain parameter for init/generateRequestParams/sign/startAttestation. We have not inspected your authenticated project settings or established a mandatory origin-allowlist field. If your project actually has an Allowed origins/domains or Website setting, add the canonical production origin https://proofquest-nu.vercel.app and remove any localhost-only restriction that would block it. Do not invent a redirect field: this desktop flow uses the browser extension, not a new OAuth callback. Confirm available quota and production extension site access. If a domain restriction error appears after deployment, share only its safe code.

## Network audit

The server uses the official SDK's local cryptographic verifyAttestation method; there is no invented HTTP signature-verification endpoint. Server signing is also local SDK cryptography after init with credentials. The SDK/browser/Primus extension handles the official Primus quota and proof-generation network calls. The only new outbound server dependency is HTTPS Redis REST. No server request is made to a localhost verification service. Localhost checks remain solely in the explicit local-development branch.

Live Vercel configuration/signing and Redis scripts were verified on the approved deployment. The public Primus quota lookup recognized the project and reported available quota. The user then confirmed a genuine public X proof and receipt. No HTTP signature-verification endpoint was invented.

## Release/test procedure

1. Set all required Production variables using the correct current project credentials and Redis read/write token. Confirm project quota. Keep secrets out of chat and Git.
2. Review this change and explicitly authorize push/deploy. Only then publish, wait for build READY and open the canonical production URL.
3. Check /api/poc/config returns public appId/template/recipient with no secret, no-store headers and a Secure/HttpOnly session cookie. Missing configuration must return 503; no local-only/public-preview message should remain.
4. In desktop Chrome/Edge with Primus enabled for this site, click Generate real proof and complete X authentication through Primus. Expect green VERIFIED, the four completed steps, and a SHA-256 receipt only after server acceptance. Never share raw proofs, passwords or cookies.
5. Confirm browser B cannot reuse browser A's attempt, consumed attempts cannot be retried, wrong/expired challenges fail, and repeated signing within cooldown returns 429 with Retry-After. Do not weaken checks to satisfy the test. The initial release passed a live concurrent malformed-payload consume test and cross-session rejection; repeat these checks for security-sensitive future changes.
6. Check browser bundles/API responses for secrets, inspect redacted service errors only, verify desktop 1438x789 and mobile 390px including expanded Technical details. Rewards wording stays unchanged and claims remain off.

## Prepared files

- lib/verification-store.ts — shared REST Redis attempts and atomic consume/rate-limit Lua scripts; separate local adapter.
- lib/verification-context.ts — modes, exact origin checks, session cookies, HMAC identifiers, per-IP/session quotas and safe HTTP errors.
- lib/poc.ts — preserve proof validation; move attempt persistence into the shared store.
- app/api/poc/config/route.ts — public configuration plus session bootstrap and rate protection.
- app/api/poc/request/route.ts — session-bound, rate-limited server signing and secure attempt cookie.
- app/api/poc/verify/route.ts — rate-limited one-time consume before unchanged proof checks.
- app/api/poc/cancel/route.ts — session-bound invalidation in the same shared store.
- lib/diagnostics.ts — clear configuration/session/storage/origin/rate-limit wording; remove preview-only wording.
- app/proof-experiment.tsx — remove local-only button/copy; preserve the real SDK flow and honest disabled-claims notice.
- app/style.css — tighter desktop first screen and full wrapping for expanded technical details.
- .env.example — enumerate public-mode and shared-storage variables without secrets.
- tests/poc.test.ts — update origin/isolation/signing tests for session context.
- tests/verification-store.test.ts — store contract, consume concurrency, REST adapter and failure/429 tests.
- tests/public-api.test.ts — production-like route integration using a Redis HTTP fixture; no fake successful attestation.
- tests/browser/poc.spec.ts / polish.spec.ts — public-ready/config/rate-message/desktop/mobile detail checks.
- README.md, docs/SECURITY.md, docs/TESTING.md, docs/PUBLIC_VERIFICATION.md — current preparation status, environment audit and release procedure.

## Production validation and genuine proof evidence

- Live home and config returned 200; signing returned 200 with Secure/HttpOnly session cookies.
- A different session could not consume the attempt (PQ_ATTEMPT).
- Two concurrent malformed-payload verification requests returned exactly one PQ_PAYLOAD and one PQ_ATTEMPT, exercising the real Redis atomic take script. No invalid proof was accepted.
- Immediate repeated signing returned 429/PQ_RATE_LIMIT with Retry-After; wrong Origin returned 403.
- The official public Primus app-quote lookup recognized the project and showed available quota.
- Lint, TypeScript and 78 unit/route/store tests passed. Initial deployed browser acceptance passed 12/12 (transport fixtures, not fake successful proofs). Additional short-viewport layout checks are included for the final layout follow-up.
- A genuine public proof was user-confirmed on Chrome with Primus: VERIFIED, all four journey checkpoints, no error, receipt fingerprint `0xbed0ce67eacd9918662ca0a6fdaaf9f561fb7d367289e8640050d2ee339f43f4`, attested 2026-11-23 21:59:13 Asia/Saigon. No X username, password, cookie or raw proof is retained here.

The public proof is separate evidence from browser fixtures and negative backend tests. Anonymous sessions are not wallet ownership, stable X identity or unique-human authentication. Rewards/claims remain disabled. Lightweight rate limits are not a complete anti-bot system. Exact expected parseType and an explicit signed Hub-template-ID field remain outside the supported checks as previously documented. Secrets and production variables are not printed or checked into Git.


## Feedback recovery update (2026-11-24)

SDK 0.3.15 starts its own timeout only after `getAttestationRes`. ProofQuest therefore bounds initialization to 12 seconds, signing to 15 seconds, extension acknowledgement to 15 seconds, the whole attestation operation to 150 seconds, and server verification to 20 seconds. An acknowledgement is only a liveness hint, never evidence of account ownership. Cryptographic and quest checks still gate every real receipt.

Cancel immediately stops local progression, clears the pending-reload marker, invalidates the session-bound server attempt and asks the official SDK to close its data-source tab. SDK tab-close is not a guaranteed abort API. After cancel or an attestation failure, **Reset connection & retry** reloads the page to discard the old SDK instance, event listeners and polling before allowing a new operation. No private SDK flags are patched. If server cancellation cannot be acknowledged, the UI explains that the attempt expires within five minutes. A proof already accepted by the server cannot be retracted by Cancel.

The extension pill requires a completed SDK initialization handshake. Only that step is marked complete initially; X connection and proof generation advance together once an attestation is returned. The verified account name is returned only after server signature, challenge, source and account-field checks pass. It is rendered in the current receipt, not stored in browser storage or diagnostic logs. No wallet authentication is implied.

Request protection is now a 30-second session cooldown plus hard anti-abuse limits of 30 signing requests/session/hour and 60/IP/hour. Cooldown refusals no longer increment hourly request counters. Consuming a valid owned attempt through cancel (including cleanup after an SDK failure) releases its short cooldown. The hard abuse counters deliberately are not refundable via client-reported failures or cancellations; otherwise an attacker could bypass signing limits. These counters are request allowances, not successful-proof credits. The app has no separate per-user proof quota; Primus billing/credit decisions remain controlled by Primus and are not promised to be refundable.

429 responses include Retry-After plus safe retry/reset metadata. The UI shows HH:MM:SS, disables retry while waiting, retains safe error metadata through reload and displays the remaining request allowance returned by signing. Raw proofs, cookies, secrets, account names and receipts are not persisted in sessionStorage. The install link is always available, receipt preview is explicitly illustrative, and GitHub Issues provides a concrete support destination. Rewards remain disabled.
