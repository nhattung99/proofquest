import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Wallet } from 'ethers';
import { authenticateWallet, createWalletChallenge, persistWalletLink, revokeLoginChallenge, revokeWallet, walletProfile, walletSession } from '../lib/wallet-auth';
import { MemoryVerificationStore, RedisVerificationStore, BIND_SCRIPT } from '../lib/verification-store';
import type { VerificationContext } from '../lib/verification-context';
import { issueAttempt, verifyAttempt } from '../lib/poc';

let ctx: VerificationContext;
beforeEach(() => {
  vi.stubEnv('PRIMUS_APP_SECRET', `0x${'12'.repeat(32)}`);
  vi.stubEnv('PRIMUS_APP_ID', 'synthetic-test-app');
  vi.stubEnv('PRIMUS_TEMPLATE_ID', '2e3160ae-8b1e-45e3-8c59-426366278b9d');
  vi.stubEnv('PRIMUS_RECIPIENT', '0x1111111111111111111111111111111111111111');
  ctx = { origin: 'https://proofquest.example', session: 'a'.repeat(64), sessionHash: 'b'.repeat(64), ipHash: 'c'.repeat(64), secure: true, store: new MemoryVerificationStore() };
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function login(wallet = Wallet.createRandom(), browser = ctx) {
  const challenge = await createWalletChallenge(browser, { address: wallet.address, chainId: 1 });
  const signature = await wallet.signMessage(challenge.message);
  const response = await authenticateWallet(browser, challenge.token, signature);
  const auth = (await walletSession(browser, response.token))!;
  return { wallet, challenge, signature, response, auth };
}
const link = (wallet: string, screenName = 'fixture_user', fingerprint = 'ab') => ({ wallet, screenName, timestamp: Date.now(), attestationHash: `0x${fingerprint.repeat(32)}` });

it('authenticates a real EOA signature over a domain-bound, expiring SIWE message, and consumes its nonce once', async () => {
  const result = await login();
  expect(result.challenge.message).toContain('proofquest.example wants you to sign in');
  expect(result.challenge.message).toContain('URI: https://proofquest.example');
  expect(result.challenge.message).toContain('Expiration Time:');
  expect(result.auth.address).toBe(result.wallet.address);
  await expect(authenticateWallet(ctx, result.challenge.token, result.signature)).rejects.toMatchObject({ code: 'PQ_WALLET_NONCE' });
  expect(await walletSession({ ...ctx, sessionHash: 'other-browser' }, result.response.token)).toBeNull();
});
it('a different browser cannot burn a nonce, and a different signer cannot authenticate it', async () => {
  const wallet = Wallet.createRandom();
  const challenge = await createWalletChallenge(ctx, { address: wallet.address, chainId: 1 });
  const signature = await wallet.signMessage(challenge.message);
  await expect(authenticateWallet({ ...ctx, sessionHash: 'other' }, challenge.token, signature)).rejects.toMatchObject({ code: 'PQ_WALLET_NONCE' });
  await expect(authenticateWallet(ctx, challenge.token, await Wallet.createRandom().signMessage(challenge.message))).rejects.toMatchObject({ code: 'PQ_WALLET_SIGNATURE' });
  await expect(authenticateWallet(ctx, challenge.token, signature)).rejects.toMatchObject({ code: 'PQ_WALLET_NONCE' });
});
it('rejects changed origins, expired nonces and cancelled sign-in challenges', async () => {
  const wallet = Wallet.createRandom();
  let challenge = await createWalletChallenge(ctx, { address: wallet.address, chainId: 1 });
  await expect(authenticateWallet({ ...ctx, origin: 'https://evil.example' }, challenge.token, await wallet.signMessage(challenge.message))).rejects.toMatchObject({ code: 'PQ_WALLET_NONCE' });
  challenge = await createWalletChallenge(ctx, { address: wallet.address, chainId: 1 });
  await revokeLoginChallenge(ctx, challenge.token);
  await expect(authenticateWallet(ctx, challenge.token, await wallet.signMessage(challenge.message))).rejects.toMatchObject({ code: 'PQ_WALLET_NONCE' });
  challenge = await createWalletChallenge(ctx, { address: wallet.address, chainId: 1 });
  vi.useFakeTimers(); vi.setSystemTime(Date.now() + 301000);
  await expect(authenticateWallet(ctx, challenge.token, await wallet.signMessage(challenge.message))).rejects.toMatchObject({ code: 'PQ_WALLET_NONCE' });
});
it('uses the authenticated recipient in the official signed Primus request and rejects a changed login session', async () => {
  const first = await login();
  const issued = await issueAttempt(ctx, first.auth);
  expect(JSON.parse(issued.signedRequest).attRequest.userAddress).toBe(first.wallet.address);
  const second = await login(first.wallet);
  await expect(verifyAttempt(issued.token, {}, ctx, second.response.token)).rejects.toMatchObject({ code: 'PQ_WALLET_SESSION' });
  expect(await walletProfile(ctx, first.wallet.address)).toBeNull();
});
it('logout invalidates both the auth token and a pending wallet-bound proof; invalid proofs never create a profile', async () => {
  const result = await login();
  const issued = await issueAttempt(ctx, result.auth);
  await expect(verifyAttempt(issued.token, {}, ctx, result.response.token)).rejects.toThrow();
  expect(await walletProfile(ctx, result.wallet.address)).toBeNull();
  const next = await issueAttempt(ctx, result.auth);
  await revokeWallet(ctx, result.response.token);
  expect(await walletSession(ctx, result.response.token)).toBeNull();
  await expect(verifyAttempt(next.token, {}, ctx, result.response.token)).rejects.toMatchObject({ code: 'PQ_WALLET_SESSION' });
});
// Storage-only link fixtures below are NOT Primus attestations or proof acceptance tests.
it('stores a link for later sign-in, normalizes ownership comparisons and rejects proof replay', async () => {
  const result = await login();
  const record = link(result.wallet.address);
  await persistWalletLink(ctx, result.auth, record);
  expect(await walletProfile(ctx, result.wallet.address)).toEqual(record);
  await expect(persistWalletLink(ctx, result.auth, record)).rejects.toMatchObject({ code: 'PQ_REPLAY' });
  await revokeWallet(ctx, result.response.token);
  await expect(persistWalletLink(ctx, result.auth, link(result.wallet.address, 'fixture_user', 'cd'))).rejects.toMatchObject({ code: 'PQ_WALLET_SESSION' });
  expect(await walletProfile(ctx, result.wallet.address)).toEqual(record);
});
it('allows exactly one wallet to claim a screen name concurrently and never overwrites conflicting bindings', async () => {
  const a = await login(); const other = { ...ctx, sessionHash: 'd'.repeat(64) }; const b = await login(Wallet.createRandom(), other);
  const outcomes = await Promise.allSettled([persistWalletLink(ctx, a.auth, link(a.wallet.address, 'Same_Name', 'aa')), persistWalletLink(other, b.auth, link(b.wallet.address, 'same_name', 'bb'))]);
  expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.find(item => item.status === 'rejected')).toMatchObject({ reason: { code: 'PQ_BIND_CONFLICT' } });
  await expect(persistWalletLink(ctx, a.auth, link(a.wallet.address, 'different', 'cc'))).rejects.toMatchObject({ code: 'PQ_BIND_CONFLICT' });
  await expect(persistWalletLink(ctx, a.auth, link(b.wallet.address, 'other', 'dd'))).rejects.toMatchObject({ code: 'PQ_WALLET_SESSION' });
});
it('uses one Redis Lua commit for auth, uniqueness and fingerprint replay', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ result: 'OK' })); vi.stubGlobal('fetch', fetcher);
  const store = new RedisVerificationStore('https://example.upstash.io', 'synthetic', 'fixture');
  const record = link(Wallet.createRandom().address);
  await store.bindWallet('auth:id', 'browser', 'wallet:id', 'x:id', 'proof:id', record);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(['EVAL', BIND_SCRIPT, 5, 'fixture:identity:auth:id', 'fixture:identity:wallet:id', 'fixture:identity:x:id', 'fixture:identity:proof:id', 'fixture:identity:active:browser', 'browser', JSON.stringify(record), JSON.stringify('id'), expect.any(Number)]);
});

it('a superseded login cannot be used, and logout prevents a signed but unfinished challenge from activating', async () => {
  const first = await login();
  const second = await login(first.wallet);
  expect(await walletSession(ctx, first.response.token)).toBeNull();
  expect(await walletSession(ctx, second.response.token)).not.toBeNull();
  const challenge = await createWalletChallenge(ctx, { address: first.wallet.address, chainId: 1 });
  const signature = await first.wallet.signMessage(challenge.message);
  // Logout does not need to know an in-flight response's new wallet cookie.
  await revokeWallet(ctx);
  await expect(authenticateWallet(ctx, challenge.token, signature)).rejects.toMatchObject({ code: 'PQ_WALLET_NONCE' });
  expect(await walletSession(ctx, second.response.token)).toBeNull();
});
