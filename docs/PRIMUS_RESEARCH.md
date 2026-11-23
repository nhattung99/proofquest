# Phase 0 — Primus research

Research date: 2026-10-28. Recommendation: **@primuslabs/zktls-js-sdk 0.3.15**, enterprise mode with server signing, for the first browser quest experiment. npm reported Network SDK **0.1.11**. Version numbers are registry observations, not a guarantee of support or successful proof execution.

## SDK comparison

| Question | Enterprise zkTLS JS SDK | Network JS SDK |
|---|---|---|
| Package | @primuslabs/zktls-js-sdk | @primuslabs/network-js-sdk |
| Trust | Primus proprietary attestor | Primus Network attestors and on-chain task workflow |
| Desktop browser extension | Required | Required |
| Proof generation wallet/gas | No transaction required; recipient is an identifier | Wallet, transaction gas and task fees required for submitTask |
| Credentials | appId + server-only appSecret | Wallet provider; no enterprise app credentials in documented example |
| Chains | Generation is off-chain; separate Solidity verification available | Published 0.1.11 source lists Base Sepolia 84532, Base 8453, HashKey testnet 133 and HashKey 177; live deployments not tested |
| Template | Developer Hub UUID | Developer Hub UUID |
| Generation | init → generateRequestParams → sign (server) → startAttestation (browser) | init → submitTask → attest (spread submission inputs and outputs) |
| Verification | verifyAttestation returns boolean | Example uses verifyAndPollTaskResult; separate backend/on-chain validation needed |
| Conditions | Nested arrays grouped by source URL; SHA256 and numeric comparisons | Similar capabilities but different API; do not interchange calls |

Enterprise is selected to test user-side Web2 provenance without gas or blockchain deployment. It has a centralized attestor trust dependency. A decentralized task workflow can be evaluated later if product requirements justify gas costs. Official docs advertise 100 free proofs/appId; actual quota must be checked in the user's project, not assumed.

## Sources inspected

- [Primus site](https://primuslabs.xyz/) and [Developer Hub](https://dev.primuslabs.xyz/): Hub is a client application; public browsing returned no inspectable template catalog. No authenticated project/template configuration was accessed.
- [Primus GitHub organization](https://github.com/primus-labs).
- [Enterprise overview](https://docs.primuslabs.xyz/enterprise/zk-tls-sdk/overview/), [attestation structure](https://docs.primuslabs.xyz/enterprise/attestation-structure/).
- [SDK source](https://github.com/primus-labs/zktls-js-sdk): src/index.ts, src/classes/AttRequest.ts, src/utils.ts, types, constants and README.
- [Tutorial](https://github.com/primus-labs/zkTLS-tutorial): separates frontend extension integration from backend credential-based core flows. Historical AlphaNet links are not treated as current network configuration.
- [Core SDK](https://github.com/primus-labs/zktls-core-sdk): inspected README/package and repository layout; not selected. A backend proof flow would require server access to Web2 authorization material and is unsuitable for our no-cookie-collection requirement.
- [Contracts](https://github.com/primus-labs/zktls-contracts): README, contract layout and verifier sources; Solidity verification is separate from quest eligibility. No contracts deployed.
- [Demo](https://github.com/primus-labs/zktls-demo): production-example client and server, plus network-sdk-example. The example signing server signs arbitrary supplied strings; our harness instead builds requests from fixed server configuration.
- [Official skills](https://github.com/primus-labs/skills): both browser SKILL.md files, enterprise package/doctor and references reviewed. Followed enterprise production-signing guidance. No setup script is provided by that skill; its doctor is a Vite/main.js text scanner and cannot validate Next.js. We use lint, TypeScript, Vitest, production bundling and Playwright instead. User's explicit Next.js/secret-handling requirements override the skill's Vite output and frontend test-signing suggestions.
- Requested [primus-network-sdk](https://github.com/primus-labs/primus-network-sdk) could not be cloned (Repository not found), although npm metadata for @primuslabs/network-js-sdk still points there. A guessed network-js-sdk repository also returned not found. Fallback: downloaded the official npm 0.1.11 tarball with npm pack (no scripts), SHA1 adcd5d089453ef656ef2eb9399d278ae7eb905da, and inspected its README plus src/index.ts, constants and TaskContract.ts. Its source expands supported chains beyond the skill's Base-only list. TaskContract queries attestorFee + primusFee and sends their total as transaction value, in addition to gas; no numeric fee is assumed. Network verifyAndPollTaskResult queries contract task status/results and can return partial success at timeout, so strict reward eligibility would need an explicit acceptance policy. No live Network calls or transactions were made.
- Production/API documentation routes returned access errors through web tooling; cloned official production example and SDK implementation provided API evidence instead. Do not interpret route failures as proof those docs are unavailable to a human browser.

## Exact upstream revisions

| Repository | Inspected HEAD |
|---|---|
| skills | a954af9b7975f85cf420c627202b07cd533029ca |
| zktls-js-sdk | 0265962b1d4b8e9db56ff7b1e9120a0ad5235978 |
| zktls-demo | f0de0d07b8d1a31328622653232bd01d2bb2f450 |
| zkTLS-tutorial | 84531b7dcee891c3dae06003705d96432c80da2b |
| zktls-core-sdk | 24b1944f1c53154420649ae9cbe13865d41ab6de |
| zktls-contracts | e14c7b1ce35c6603ffa9393978e224998a41859b |

## First quest

Candidate: **Verify your X account**; disclose one `screen_name` string. Template **2e3160ae-8b1e-45e3-8c59-426366278b9d** appears in production-example/client/src/primus.js; network-sdk-example/src/primus.ts explicitly identifies it as X account ownership and names `screen_name` with JSONPath `$.screen_name`.

This verifies a source response, not unique-human status, follower count, following Primus, or posting a tweet. Current template availability, exact endpoint, resolver parseType, user login compatibility and output shape remain unverified until Developer Hub configuration and real execution. No endpoint was guessed in application configuration. A first reward quest would additionally require authenticated wallet binding and enforceable Web2 identity deduplication before points are enabled.

## Security findings

`verifyAttestation` hashes recipient, request, resolver definitions, data, conditions, timestamp and additionParams, then recovers signatures[0] against the SDK's pinned production attestor address. It does not trust the supplied attestors array. It is synchronous in 0.3.15. It does NOT enforce freshness, wallet ownership, eligibility, uniqueness, or explicit template ID (absent in output).

Signed additionParams can carry a fresh random challenge. Source review supports this design; only a real run can establish the extension/attestor preserves it. The harness checks exact challenge bytes, recipient and fresh millisecond timestamps. This is attempt binding, not proof of control over a wallet. The template ID embedded in our challenge is application context, not independent evidence that a particular Hub template was executed. Match exact signed source and resolvers; require an explicit template binding mechanism if template identity beyond equivalent semantics is necessary.

The SDK uses packed variable-length strings for signing. This is the upstream mechanism; no stronger canonical serialization guarantee is claimed. Keep allowed inputs tightly constrained and review ambiguities before valuable claims. SDK window-message handling and browser console/telemetry behavior also need review before a public release. UI success and extension messages are never accepted without backend signature verification.

Default results disclose plaintext. SHA256 does not necessarily protect low-entropy data from guessing. Incorrect nested condition grouping can cause plaintext disclosure according to the official skill. No 'fully private' claim is justified.

## Phase outcome

Feasibility supported by inspected official APIs and examples; live feasibility NOT established. Missing project credentials, extension confirmation and exact template metadata prevent a genuine end-to-end acceptance test. Implemented a local harness for that next step. Full dashboard is intentionally gated.


## Confirmed template update — 2026-10-28

The owner confirmed Account Ownership (X) in Developer Hub Templates Market: template `2e3160ae-8b1e-45e3-8c59-426366278b9d`, source page `https://x.com/home`, request pattern `https://api.x.com/1.1/account/settings.json.*`, extracted `screen_name`, JSONPath `$.screen_name`. This supersedes the earlier uncertainty about template availability and endpoint. Exact SDK resolver `parseType` is still needed; it is not inferred from JSONPath. A genuine proof has still NOT been run.

The harness now fixes the approved template and endpoint; it allows only an optional query on that endpoint instead of interpreting `.*` as arbitrary suffix permission. Source/resolver and screen-name checks are mandatory for success. No follow/post/like/repost claim is made.

SDK 0.3.15 full-response console diagnostics and optional eventReport transport are removed from the app's bundled SDK by a narrowly scoped webpack privacy loader. Proof/signature logic stays official. Both production and dev scripts explicitly use webpack. Extension diagnostics and browser Network tools remain outside this application's logging control.


Subsequent owner clarification: Marketplace exposes no parseType. Inspection of official production demo and AttRequest confirms the template ID can be used directly without supplying resolvers. Removed manual resolver setup. Validate returned signed keyName/parsePath, leave expected parseType unpinned, report the limitation, and continue to disable rewards. Earlier references to requiring parseType before the first generation are superseded by this finding. No safe Hub export was established or required.

Follow-up source audit: the JS SDK constructs a request with attTemplateID and forwards the signed request to the browser extension; it does not itself fetch a template definition. Automatic resolution is a property of the supported extension/service workflow from the caller's perspective, not an independently inspected internal template lookup. The returned parseType string remains necessary for official signature encoding, but no expected parseType value or manual resolver setting is needed. Existing implementation already follows this distinction. See PRIMUS_INTEGRATION.md for exact source links and signing separation.


2026-11-23 live evidence: a user-generated X attestation passed both the browser/server official verifier and application policy after accounting for signed reveal_id=screen_name metadata. The user confirmed green VERIFIED and a receipt at 18:24:04 Asia/Saigon. Earlier statements of no real success are historical. No new template or parser type was invented. The policy validates optional reveal_id and FIELD_REVEAL type against the approved field rather than accepting arbitrary metadata. Wallet authentication, durable replay/cross-user reward claims and explicit signed Hub-template identity remain limitations.
