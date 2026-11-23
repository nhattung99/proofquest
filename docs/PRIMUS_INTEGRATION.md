# Verify Your X Account — real browser test

## Confirmed public configuration

Owner confirmed in Primus Developer Hub Templates Market on 2026-10-28:

- Project ProofQuest; appId `0x7efc83100296092995edd8e7606575a311d1c9c2`.
- Account Ownership (X), ID `2e3160ae-8b1e-45e3-8c59-426366278b9d`.
- Source page `https://x.com/home`.
- Request pattern `https://api.x.com/1.1/account/settings.json.*`.
- Extracted `screen_name`, JSONPath `$.screen_name`.

This quest establishes the supported account-ownership assertion, not following, posting, liking, reposting, unique humanity or permanent X identity. Usernames can change and be reassigned.

## Does parseType need manual configuration?

No, not to generate the proof. The [official production demo](https://github.com/primus-labs/zktls-demo/blob/f0de0d07b8d1a31328622653232bd01d2bb2f450/production-example/client/src/primus.js) passes this exact template ID and a recipient into `generateRequestParams`, signs the request and calls `startAttestation`. It does not supply a resolver. Its [README](https://github.com/primus-labs/zktls-demo/tree/f0de0d07b8d1a31328622653232bd01d2bb2f450/production-example) explicitly permits selecting a Marketplace template.

The [SDK request class](https://github.com/primus-labs/zktls-js-sdk/blob/0265962b1d4b8e9db56ff7b1e9120a0ad5235978/src/classes/AttRequest.ts) contains the template ID, not a caller-supplied resolver definition. The resolver arrives in the attestation. Marketplace does not expose parseType according to the owner; its exact value is unknown. No safe export was verified or needed. No undocumented Hub endpoint was called.

The harness validates the returned resolver field/path and signature but deliberately leaves expected parseType unpinned. No manual resolver environment variable is needed. Signature coverage includes its actual parseType bytes, but signature validity alone does not establish that those bytes implement the expected parser semantics. Record this limitation until a genuine proof can be reviewed. Do not guess or silently normalize it.

### Where template resolution happens

Source inspection distinguishes the application API from the extension implementation:

- `generateRequestParams` constructs an `AttRequest` containing `attTemplateID` and the recipient. It does not fetch the template or require endpoint/resolver inputs.
- `sign` signs that serialized request. In ProofQuest this runs only in the Node route's server dependency, initialized with appId/appSecret.
- Desktop `startAttestation` validates the signed request and posts it to the Primus extension as a `startAttestation` message. The response supplies the attestation, including `reponseResolve` (the SDK's spelling).
- Thus template handling is automatic from the DApp caller's perspective and delegated to the Primus extension/service workflow. The inspected JS SDK does not expose the internal template-fetch operation; no particular internal Hub API or lookup implementation is claimed to have been verified.

Evidence: [SDK request/generation and extension handoff](https://github.com/primus-labs/zktls-js-sdk/blob/0265962b1d4b8e9db56ff7b1e9120a0ad5235978/src/index.ts), [production browser example](https://github.com/primus-labs/zktls-demo/blob/f0de0d07b8d1a31328622653232bd01d2bb2f450/production-example/client/src/primus.js), and [server-signing example](https://github.com/primus-labs/zktls-demo/blob/f0de0d07b8d1a31328622653232bd01d2bb2f450/production-example/server/index.js). The production documentation URL could not be fetched with web tooling; source inspection supplies the evidence above.

`parseType` remains a required **returned string field** in our attestation schema because the official `encodeResponse` hashes its exact bytes when verifying the signature. This is not a request-generation dependency or a required setting. Removing it, guessing it, or overwriting it before verification would break the official signature representation. An additional business rule could pin an expected parser type, but no documented value for this template was established, so that rule is absent. Signed source/field/path plus validated data satisfy the currently supported structural checks; they do not prove explicit template identity or fully replace parser-semantic validation. Rewards stay disabled.

### Current signing separation

Browser: `init(appId)` → request local server signing → `startAttestation(signedRequest)` → official verification → server verification.

Server: `init(appId, appSecret)` → `generateRequestParams(fixedTemplateId, recipient)` → set challenge → `sign(request.toJsonString())`.

The config route returns only public appId/template/recipient, and the signing route returns only the signed request. The local harness does not copy the TEST example's browser secret pattern. This signing separation is suitable for the eventual production design; the overall harness remains localhost-only and lacks production authentication/persistence.

## Manual setup and real test

1. Keep the existing Marketplace template unchanged. The inspected official flow does not require creating, editing, or cloning it, or entering parseType into your project. Your existing appId/appSecret pair is the required project setup. If Hub shows a quota/access restriction, resolve that restriction there; do not bypass it with a fake proof.
2. In ignored `.env.local`, enter the project's appSecret and your own EVM address under `PRIMUS_RECIPIENT`. The public appId/template ID are already set. Set `PROOFQUEST_POC_ENABLED=true`. Never send appSecret, wallet keys, X cookies or passwords in chat. Do not replace an existing secret with the example file.
3. Install/enable the [official Primus extension](https://chromewebstore.google.com/detail/primus/oeiomhmbaapihbilkfkhmlajkeegnjhe) in a supported desktop Chromium browser. Allow it on the local site. This first harness targets desktop, not mobile proof generation.
4. Run `npm run dev` from the project directory. Open `http://127.0.0.1:3000` in the browser with Primus installed. Use the same origin throughout. If missing-extension status appears, enable the extension and reload.
5. Click **Generate real proof**. The server creates a one-time five-minute attempt, fixes the approved template and recipient, and signs a random challenge with quest/policy context. No wallet transaction or gas is required. This may use your application proof quota.
6. Complete the X login/verification in the Primus flow. Authenticate only with the actual X service. ProofQuest does not collect X passwords or cookies. Finish within five minutes; if cancelled/timed out, wait 30 seconds, reload and create a new attempt.
7. The browser invokes official `verifyAttestation`. The server independently invokes it again, consumes the attempt and validates recipient, exact challenge, timestamp, GET/empty body, strict X account-settings endpoint (optional query only), exactly one screen_name resolver at $.screen_name, plaintext conditions and a 1–15 character ASCII screen_name containing only letters, digits or underscores.
8. A passing local result reports authenticity/binding and supported policy checks, `resolverParseTypePinned: false`, `walletAuthenticated: false`, and `rewardsEnabled: false`. It never prints screen_name or the full proof. Share only this non-sensitive status or a sanitized error description. Do not share browser Network captures or raw attestation payloads.
9. Confirm one-time attempt reuse, tampering, expired attempts and cross-recipient rejection before release. Automated synthetic tests are not evidence of genuine proof success. A real proof and its negative checks remain pending until executed with your configured browser.

If a signed output differs from the expected field/path, request method/body or conditions format, fail closed and inspect only redacted structural metadata; do not loosen checks blindly. An unpinned parseType is explicitly reported, not represented as fully verified template semantics.

## Wallet association and template-identity limit

This harness uses a configured recipient, not an authenticated wallet. A valid recipient string does not prove wallet control. For secure association in the later authenticated backend:

1. Authenticate control of the wallet with SIWE: server nonce, domain/URI/chain binding, expiration and one-time consumption; establish a secure HttpOnly session.
2. Take the recipient exclusively from that session. Persist a random attempt linked to user, wallet, quest, policy version and expiry. Include a random challenge and that context in signed additionParams.
3. After official signature verification, compare signed recipient and exact additionParams against the persisted attempt and active session. Reject expired/future proofs and mismatches; never accept a frontend success flag or supplied username.
4. Consume the attempt/proof and insert the unique quest claim and ledger entries atomically in PostgreSQL. Enforce unique user/quest and replay identifiers. Distributed processes must share durable state.

The [official attestation type/signature encoding](https://github.com/primus-labs/zktls-js-sdk/blob/0265962b1d4b8e9db56ff7b1e9120a0ad5235978/src/utils.ts) covers recipient, request, resolvers, data, conditions, timestamp and additionParams. It has no template-ID field. Our request fixes the template and the signed challenge names it, but this is request provenance/context, not independent attestor certification of Hub template identity. Returned signed source/field/path can be checked. If exact template identity beyond those semantics is required for claims, rewards remain blocked pending an official mechanism.

Associating the freshly verified username to a signed-in wallet proves that session supplied the proof; it does not prove exclusive ownership by one human, prevent consensual account sharing, or safely deduplicate permanent X identities. Do not treat a mutable screen_name as a permanent unique X user ID. Establish an appropriate stable identity policy before identity-based rewards.

## Privacy and completion gate

2026-11-15 live-test report: the user observed Primus completion, while the harness returned PQ_CHALLENGE during backend verification. In this code path the official backend signature check precedes the challenge check, so the reported result supports signature acceptance, not full quest acceptance. No raw proof was retained. The upstream SDK test fixture contains application additionParams plus algorithmType=proxytls (test/index.test.ts at inspected revision). Updated challenge comparison to accept JSON key ordering/whitespace differences and that single optional metadata field after verifying the original signature. All purpose/quest/policy/template/nonce fields remain required and equal; other metadata or algorithm values are rejected. This supersedes earlier requirements for identical serialized challenge bytes. Whether this fixes the observed live failure still needs a fresh genuine test. Rewards remain disabled.

Official SDK 0.3.15 remains the proof generator/verifier. A scoped webpack loader removes upstream console calls and disables its optional eventReport diagnostics transport in both server/client bundles; signature/attestation code is preserved. Both dev and build use webpack. No global console monkeypatch or raw account logging is used. Browser Network inspection and the separately installed extension are outside this suppression; no complete privacy claim is made.

A real X attestation passed the local backend on 2026-11-23; authenticated wallet and durable claim validation remain pending. Production claims remain unconditionally disabled until genuine verification, replay/cross-user controls, durable authenticated transactions and documented limitations are accepted. No deployment or contract transaction is performed.


2026-11-23 conditions follow-up: empty conditions and one explicit REVEAL_STRING on the confirmed field/path now count as plaintext, after the original signature check. Nonempty comparison values/hash/comparison operators remain rejected. The user still observed PQ_CONDITIONS twice; the root of this remaining mismatch is not established. A developer-only allowlisted summary at /api/poc/diagnostics supports the next real attempt; production returns 404. Successful backend verification now returns a SHA-256 payload/signature fingerprint for the receipt. No claims are enabled. See FIX_AND_POLISH.md.


Confirmed real success, 2026-11-23 18:24:05 Asia/Saigon: final conditions policy accepted the observed signed REVEAL_STRING for $.screen_name with reveal_id=screen_name. Earlier strict schemas wrongly rejected that documented metadata. The next server log line for /api/poc/verify is HTTP 200. Optional reveal metadata is validated, not ignored. This establishes genuine local proof generation plus backend acceptance for this run; it does not validate SIWE, durable replay resistance, cross-user claims or rewards. The development-only summary remains redacted. See FIX_AND_POLISH.md for the evidence and final workflow.
