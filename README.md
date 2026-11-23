# ProofQuest

Verify Actions. Earn Trust. Unlock Rewards.

Independent community project exploring Primus zkTLS for verifiable quests. **Current state: Phase 0 research plus a local Phase 1 proof harness. A genuine X proof passed the local backend on 2026-11-23; wallet authentication and durable claims remain pending. No rewards, dashboard, wallet authentication, database, or deployment is implemented.**

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

## Release gate

Do not deploy this harness publicly. It intentionally rejects non-local hosts, has no durable sessions, and does not authenticate wallet ownership. The planned repository is `https://github.com/nhattung99/proofquest`; its existence and publication are unverified. Full frontend/backend phases, Supabase, wagmi/viem, Tailwind/shadcn, reward transactions and Vercel release preparation begin only after a real attestation passes the acceptance checklist. Publishing requires user confirmation.


## Fix and polish follow-up

Next.js and eslint-config-next are pinned to 16.4.6. The existing one-page app now has extension status, a four-step journey, progress/cancel controls, dismissible errors with copyable codes, and a server-gated receipt with SHA-256 fingerprint and timestamp. No receipt is shown on SDK success alone. No rewards or public claims were enabled.

The legacy plaintext check accepted only empty conditions. It now supports the official REVEAL_STRING representation for the confirmed field/path while rejecting hashes, comparisons, unexpected fields and nonempty values. The live mismatch was traced to the signed reveal_id=screen_name property. Final policy validates it explicitly. A genuine user-run proof passed the backend on 2026-11-23, with supported checks accepted and HTTP 200. Wallet authentication and durable cross-user/replay claim protection remain unvalidated; rewards stay disabled.

Development: `npm run dev` at port 3000. Local production QA can run separately by setting `PROOFQUEST_DIST_DIR=.next-production`, running `npm run build`, then `npm run start -- --port 3200` with the same environment setting. Never deploy this localhost harness as a reward service.

See [fix and polish report](docs/FIX_AND_POLISH.md) for evidence, changed files and limitations.


## Currently deployed release (before public-verification approval)

The public Vercel deployment is a presentation preview. Real proof generation remains available only in the local harness; the public verification button is disabled and no Primus credentials are uploaded. Vercel route handlers explicitly refuse proof operations even if credentials were added accidentally. Rewards/claims remain disabled.

No Vercel environment variables are required for the preview. Do not upload .env.local or add PRIMUS_APP_SECRET to this preview project. A functional public proof service requires durable authenticated attempts and serverless-safe persistence before enabling those routes. .vercelignore excludes environment files, downloaded research, generated builds and test artifacts.

GitHub CI runs lint, typecheck, synthetic unit tests and a production build; it does not claim to run a genuine X proof. MIT license covers ProofQuest source; Primus SDK and other dependencies retain their respective licenses.


## Public verification preparation (not yet deployed)

The working tree now prepares real public verification with shared Redis attempts, anonymous session binding, exact-origin checks and per-session/IP rate limits. The deployed site is unchanged pending explicit approval; do not push main before release because Vercel is Git-connected. See [public verification setup](docs/PUBLIC_VERIFICATION.md) for the eight required Vercel variables, Primus dashboard notes, testing and remaining limitations. No Primus verification rule or reward gate was removed.
