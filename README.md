# ProofQuest

Verify Actions. Earn Trust. Unlock Rewards.

Independent community experiment verifying X account ownership with the official Primus zkTLS SDK. **Public verification is enabled at [proofquest-nu.vercel.app](https://proofquest-nu.vercel.app/), with Redis-backed one-time attempts and browser-session binding. A genuine public proof was user-confirmed on 2026-11-23. Wallet authentication and reward claims remain disabled.**

[Source code](https://github.com/nhattung99/proofquest) · [Public verification setup](docs/PUBLIC_VERIFICATION.md)

## Run on Windows

Node.js 24 and npm are available in the development environment.

```powershell
npm ci --ignore-scripts
Copy-Item .env.example .env.local
```

Your existing local project credentials are preserved. The example environment file requires your current Developer Hub appId; do not reuse an ID from a deleted project. The confirmed template ID is prefilled. The first quest is **Verify Your X Account** using Account Ownership (X), source page `https://x.com/home`, request endpoint `https://api.x.com/1.1/account/settings.json` with optional query parameters, field `screen_name`, JSONPath `$.screen_name`.

Open ignored `.env.local` in your editor. Set the project's appSecret, your EVM recipient address, and `PROOFQUEST_POC_ENABLED=true`. Put appSecret only in this file, never in chat or a NEXT_PUBLIC variable. No manual resolver/parseType configuration is needed for the Marketplace template. The expected parseType is explicitly unpinned; the backend still checks signed source, field and JSONPath. See [browser test steps](docs/PRIMUS_INTEGRATION.md). Do not paste authorization headers or cookies.

Install the [Primus extension](https://chromewebstore.google.com/detail/primus/oeiomhmbaapihbilkfkhmlajkeegnjhe) and enable it for localhost. Then:

```powershell
npm run dev
```

Open [the local harness](http://127.0.0.1:3000), select Generate real proof, and complete the X login/verification in Primus. ProofQuest never asks for X passwords or cookies. The proof discloses `screen_name`; the application suppresses upstream SDK console logs and optional telemetry in its webpack bundle; browser Network tools and extension diagnostics can still reveal data. There is no wallet transaction or gas spend in this chosen flow, but proofs may consume your Primus application quota.

The server independently calls the official `verifyAttestation`, checks freshness, recipient, and signed challenge. A successful screen reports authenticity/binding and mandatory source/resolver policy. It always reports `rewardsEnabled: false`. This is not wallet authentication, a public signing service, or a complete quest claim implementation. Refresh/restart invalidates some local attempts; wait 30 seconds between requests.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

See [research](docs/PRIMUS_RESEARCH.md), [integration](docs/PRIMUS_INTEGRATION.md), [security](docs/SECURITY.md), and [test status](docs/TESTING.md). Downloaded upstream repositories under `research/` are ignored; their revisions are recorded in the research document. No upstream setup/install scripts were executed.

## Release status and remaining gates

The approved public Vercel release supports real X verification through the Primus extension. Configure the required server-only variables and shared Redis before enabling public mode; local mode alone uses in-memory state. The deployed Redis path has passed live session, atomic-consume, replay, cooldown and origin-negative checks. The user confirmed a real public VERIFIED receipt. Anonymous session binding does not authenticate wallet ownership or unique humanity; no rewards/claims are implemented.

Changes to main auto-deploy through Vercel. Publishing still requires the owner's authorization. Full wallet auth, identity policy, atomic reward ledger and further dashboard work remain separate milestones.

## Fix and polish follow-up

Next.js and eslint-config-next are pinned to 16.4.6. The existing one-page app now has extension status, a four-step journey, progress/cancel controls, dismissible errors with copyable codes, and a server-gated receipt with SHA-256 fingerprint and timestamp. No receipt is shown on SDK success alone. No rewards or public claims were enabled.

The legacy plaintext check accepted only empty conditions. It now supports the official REVEAL_STRING representation for the confirmed field/path while rejecting hashes, comparisons, unexpected fields and nonempty values. The live mismatch was traced to the signed reveal_id=screen_name property. Final policy validates it explicitly. A genuine user-run proof passed the backend on 2026-11-23, with supported checks accepted and HTTP 200. Wallet authentication and durable cross-user/replay claim protection remain unvalidated; rewards stay disabled.

Development: `npm run dev` at port 3000. Local production QA can run separately by setting `PROOFQUEST_DIST_DIR=.next-production`, running `npm run build`, then `npm run start -- --port 3200` with the same environment setting. Never deploy this localhost harness as a reward service.

See [fix and polish report](docs/FIX_AND_POLISH.md) for evidence, changed files and limitations.


## Public deployment

The site uses server-side Primus request signing, shared Redis attempts, Secure/HttpOnly/SameSite cookies, exact-origin checks and per-IP/session limits. appSecret and Redis credentials are never shipped to the client. Do not upload .env.local. See [setup, quotas and security limits](docs/PUBLIC_VERIFICATION.md).

GitHub CI checks lint, TypeScript, synthetic unit tests and the production build. Browser fixtures are separate from the user-confirmed genuine public X proof. The MIT license covers ProofQuest source; dependencies retain their own licenses.
