# Public X verification — prepared, not deployed

This change removes the public-preview-only gate and prepares the existing real Primus X flow for Vercel. **It has not been pushed or deployed.** Pushing main currently triggers Vercel, so publication must wait for the owner's explicit confirmation. The existing public deployment remains unchanged until then.

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

Actual Redis connectivity from Vercel and production Primus quota/template access cannot be verified until credentials are configured and an approved deployment exists.

## Release/test procedure

1. Set all required Production variables using the correct current project credentials and Redis read/write token. Confirm project quota. Keep secrets out of chat and Git.
2. Review this change and explicitly authorize push/deploy. Only then publish, wait for build READY and open the canonical production URL.
3. Check /api/poc/config returns public appId/template/recipient with no secret, no-store headers and a Secure/HttpOnly session cookie. Missing configuration must return 503; no local-only/public-preview message should remain.
4. In desktop Chrome/Edge with Primus enabled for this site, click Generate real proof and complete X authentication through Primus. Expect green VERIFIED, the four completed steps, and a SHA-256 receipt only after server acceptance. Never share raw proofs, passwords or cookies.
5. Confirm browser B cannot reuse browser A's attempt, consumed attempts cannot be retried, wrong/expired challenges fail, and repeated signing within cooldown returns 429 with Retry-After. Do not weaken checks to satisfy the test. Real Redis concurrency and these cross-browser checks remain mandatory staging validation.
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

## Validation limits

The passing genuine local proof from 2026-11-23 established the underlying Primus verifier/policy. This change has not generated a new genuine public proof. Redis HTTP fixtures test the adapter contract and routing, not execution of Lua on a real Redis server. No Redis service was created, no production variables were changed, and no push/deploy was performed for this change. Live shared Redis atomicity, Vercel header delivery, any private Primus dashboard restriction and public end-to-end proof generation await configured staging and explicit release approval.


## Prepared validation results

- Lint and TypeScript passed; 78 unit/route/store tests passed.
- 12 local production browser tests passed, including above-fold action at 1438x789, 390px no-overflow, full expanded technical text, friendly 429, cancellation and interrupted-run recovery.
- Local production build passed without Redis credentials being required at build time.
- Direct local HTTP route exercise with real local application configuration: config 200, signing 200; wrong session PQ_ATTEMPT, own malformed payload PQ_PAYLOAD, reuse PQ_ATTEMPT. No X proof or quota-consuming Primus generation was invoked in this negative test.
- Static client output scanned against the existing local Primus appSecret: no matching secret value found. Public config route tests also ensure appSecret and Redis token are absent from JSON responses.
- Redis tests use explicit HTTP fixtures and local adapter contracts. No actual Redis/EVAL or new public proof success is claimed. Existing genuine local proof evidence remains separate.

No push or deployment was performed. The owner's confirmation is still required before any main-branch push because Vercel auto-deploy is connected.
