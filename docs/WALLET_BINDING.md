# MetaMask login and verified X binding

## User flow

1. Open ProofQuest in desktop Chrome or Edge with MetaMask and Primus installed.
2. Click **Login MetaMask**, unlock the wallet and select the intended EVM account/network.
3. Review the ProofQuest sign-in message and sign it. This is an EIP-4361 / EIP-191 message, not a transaction, token approval or gas payment. Never provide a seed phrase or private key.
4. Check the abbreviated wallet address in the header (hover for the full address).
5. Read the binding disclosure, then click **Verify & bind X**. This generates a NEW real Primus proof; an old anonymous receipt cannot be attached to a wallet.
6. Complete the X flow in Primus. The server independently verifies the attestation before atomically saving the link. Expect the account name and authenticated wallet on the receipt.
7. Sign out and sign in again to see the saved binding. Sign-out removes authentication, not the stored association. Rewards remain disabled.

No new environment variable is required: production continues to use the existing server-only credentials, exact public origin and Redis REST configuration. The configured PRIMUS_RECIPIENT remains the fallback for anonymous verification; wallet binding overrides it only with a server-authenticated wallet address.

## Authentication

The server constructs the complete SIWE message. It fixes domain/URI to the guarded origin, uses the selected address/chain, a cryptographically random nonce, issuance time and five-minute expiration. The browser supplies only the resulting signature to login; it cannot replace the message. A nonce is browser-session-bound and atomically consumed before verification. The ethers EOA recovery and official SIWE verifier must both succeed. Contract wallets / ERC-1271 are not supported in this version; there is no automatic RPC fallback.

The resulting one-hour opaque session uses a fresh random Secure/HttpOnly/SameSite=Strict cookie in production. Authentication records and the active login pointer live in shared Redis. Activation checks a pending login generation atomically; an old/superseded challenge cannot activate after sign-out. Each browser session has one active wallet login. Sign-out clears the pending generation before the active pointer so an in-flight signature response cannot resurrect a logged-out session. Old auth records are inaccessible after replacement and expire automatically.

Account/network changes or provider disconnect invalidate the UI identity and revoke the server session. They cancel local proof progression immediately. Session expiry also signs out. If revocation cannot be confirmed, the UI says so and asks the user to retry sign-out. The API independently checks the active wallet session: frontend wallet state is never authentication.

## Binding and replay protection

The explicit binding request asserts its expected address/chain; the server compares these to its authenticated session and generates the Primus request using that session's address as recipient. The server stores the wallet-session ID with the single-use proof challenge. Verification requires the same active login, even if a later login uses the same wallet address. Signed recipient, nonce, time, source, field/path and plaintext policy checks are unchanged.

After official Primus signature verification and quest-policy acceptance, one Lua transaction checks the still-active authenticated session, expiration, wallet ownership, existing wallet/name associations and used fingerprint, then writes both association indexes and the fingerprint marker. No link is saved on SDK success alone. Replaying a consumed proof attempt, replacing its wallet or using an anonymous proof as a binding proof fails. A final atomic check also prevents a sign-out between initial session lookup and commit from authorizing a later write.

Each wallet can bind one normalized X screen name and each normalized screen name can bind one wallet. Reproving the same pair with a fresh proof refreshes its evidence. Conflicting pairs fail without overwriting existing records; automatic reassignment/unbinding is deliberately not exposed. The receipt fingerprint marker lasts 24 hours; the five-minute proof freshness and single-use challenge continue to reject older replays after that marker expires.

## Data and limitations

Explicit binding consent is shown beside the action. Redis retains wallet address, screen name, verified attestation fingerprint and attestation timestamp so the association survives logout and new browser sessions. This derived record has no automatic TTL. Names/address index keys are HMAC-derived; records themselves contain the disclosed name/address. No raw attestation, X password/cookie, wallet private key or login signature is persisted or logged. Browser/extension diagnostics remain outside the application's control.

The template provides `screen_name`, not immutable X user ID. Handles can change and be reassigned. This association is a verified assertion at a point in time, not permanent identity, unique humanity or a safe basis for automatic rewards. Renames, transfers and account recovery require a separately designed policy. Existing associations cannot be silently transferred just by proving a new name. Rewards and claims remain off.

Current HMAC namespaces derive from PRIMUS_APP_SECRET. Rotating that secret/origin invalidates sessions and changes storage lookup namespaces; existing binding records need a planned migration and retention/deletion procedure. Do not rotate it expecting associations to migrate automatically. Public mode always fails closed on Redis failure; in-memory identity state is local-only and resets when the development process restarts.

## Acceptance and references

Automated tests use generated test EOA keys and actual ECDSA/SIWE verification. Browser tests inject a clearly synthetic MetaMask provider while using real authentication routes. None mocks a successful Primus attestation or represents a fixture binding as production proof evidence. A genuine MetaMask + Primus run is still a required manual acceptance step for the new bind path.

- [ERC-4361](https://eips.ethereum.org/EIPS/eip-4361)
- [Official SIWE library](https://github.com/spruceid/siwe)
- [MetaMask personal_sign](https://docs.metamask.com/metamask-connect/evm/reference/json-rpc-api/personal_sign/)
- [Upstash Lua EVAL](https://upstash.com/docs/redis/sdks/ts/commands/scripts/eval)
