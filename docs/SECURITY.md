# Current security status

Public ProofQuest uses exact-origin checks, same-origin POSTs, Secure/HttpOnly/SameSite cookies, shared Redis attempts, per-session/IP request limits and the official Primus cryptographic verifier. Local memory storage is restricted to explicitly enabled loopback development. Storage errors fail closed in public mode. appSecret and Redis credentials remain server-only. There are no claim/points/token-transfer endpoints; rewards remain disabled.

MetaMask SIWE login and wallet-addressed X proof binding are now implemented. See [WALLET_BINDING.md](WALLET_BINDING.md) for message constraints, nonce consumption, one active login per browser, logout ordering, atomic link commit, storage/retention and manual acceptance. Anonymous proof verification remains available and does not authenticate a wallet. Wallet binding is only reported after the server commits a verified proof to its authenticated recipient.

The signed X endpoint, method/body, field/path, plaintext conditions, screen-name syntax, nonce, recipient and freshness are mandatory. Expected resolver parseType remains unpinned; no value was invented. The signed attestation has no explicit Hub template ID, so identity is request-pinned with mandatory signed source/resolver checks. The template does not prove follows/posts/likes/reposts or an immutable X user ID.

Anonymous proofs and credentials are not persisted. Explicit wallet binding retains only the derived wallet/name/fingerprint/time record; the user is told this before binding. No raw proof, login signature, wallet key, X password or cookie is logged/stored. SDK console logging and optional telemetry remain suppressed in the webpack bundle. Browser/extension diagnostics are outside the application boundary.

Handle reuse/renaming, account recovery and permanent identity are unsolved policy limitations. An automatic rebind/unbind endpoint is not exposed. One normalized handle and wallet pair is reserved atomically, and conflicting records are not overwritten. HMAC namespace/secret rotation requires a data migration and retention plan. These controls do not establish unique humanity or a reward-ready anti-Sybil system.

The prior public genuine Primus proof was user-confirmed on 2026-11-23. It predates wallet binding. New wallet tests use real generated EOA signatures and negative proof tests; no synthetic attestation is represented as a genuine successful proof. A genuine user-run MetaMask + Primus binding remains a separate manual acceptance gate.

Dependency audit after adding SIWE reports 26 low/moderate findings inherited through the existing dependency graph, with no high/critical findings. Versions are pinned and the existing ws override is preserved. Passing tests are not a clean dependency audit. See [PUBLIC_VERIFICATION.md](PUBLIC_VERIFICATION.md) for historical release evidence and [TESTING.md](TESTING.md) for current checks.
