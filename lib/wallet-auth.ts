import { randomBytes } from 'node:crypto';
import { SiweMessage } from 'siwe';
import { utils } from 'ethers';
import { z } from 'zod';
import { digest, type VerificationContext } from './verification-context';
import { ServiceError, type WalletLink } from './verification-store';

export const walletCookie = 'proofquest_wallet';
export const loginCookie = 'proofquest_login';
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(value => utils.getAddress(value));
export const loginInput = z.object({ address: addressSchema, chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();
const authSchema = z.object({ address: addressSchema, chainId: z.number().int().positive(), sessionHash: z.string(), expiresAt: z.number() }).strict();
const nonceSchema = authSchema.extend({ message: z.string(), nonce: z.string(), origin: z.string() });
const linkSchema = z.object({ wallet: addressSchema, screenName: z.string().regex(/^[A-Za-z0-9_]{1,15}$/), attestationHash: z.string().regex(/^0x[0-9a-f]{64}$/), timestamp: z.number().int().positive() }).strict();
const tokenId = (token: string) => /^[a-f0-9]{64}$/.test(token) ? digest(`wallet-token:${token}`) : null;
export const profileKey = (address: string) => `wallet-link:${digest(`wallet:${address.toLowerCase()}`)}`;

export async function createWalletChallenge(ctx: VerificationContext, input: unknown) {
  const { address, chainId } = loginInput.parse(input);
  const token = randomBytes(32).toString('hex');
  const nonce = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 300000;
  const message = new SiweMessage({ domain: new URL(ctx.origin).host, address, uri: ctx.origin, version: '1', chainId, nonce,
    statement: 'Sign in to ProofQuest. No transaction or token approval. Linking X requires a separate verified proof and your consent.',
    issuedAt: new Date().toISOString(), expirationTime: new Date(expiresAt).toISOString() }).prepareMessage();
  await ctx.store.setData(`login:${tokenId(token)}`, { address, chainId, sessionHash: ctx.sessionHash, expiresAt, message, nonce, origin: ctx.origin }, 300);
  await ctx.store.setData(`login-generation:${ctx.sessionHash}`, tokenId(token), 300);
  return { token, message };
}

export async function authenticateWallet(ctx: VerificationContext, challengeToken: string, signature: unknown) {
  const id = tokenId(challengeToken);
  if (!id) throw new ServiceError('PQ_WALLET_NONCE', 401);
  // A wrong session cannot burn another browser's nonce. A nonce is consumed
  // before signature verification; even failed signatures require a new nonce.
  const parsed = nonceSchema.safeParse(await ctx.store.takeData(`login:${id}`, ctx.sessionHash));
  if (!parsed.success || parsed.data.expiresAt <= Date.now() || parsed.data.origin !== ctx.origin) throw new ServiceError('PQ_WALLET_NONCE', 401);
  const challenge = parsed.data;
  try {
    const sig = z.string().regex(/^0x[0-9a-fA-F]{130}$/).parse(signature);
    // EOA authentication only. No implicit chain RPC / contract-wallet fallback.
    if (utils.verifyMessage(challenge.message, sig) !== challenge.address) throw new Error('Invalid signature');
    const verified = await new SiweMessage(challenge.message).verify({ signature: sig, domain: new URL(ctx.origin).host, nonce: challenge.nonce, time: new Date().toISOString() });
    if (!verified.success || verified.data.uri !== ctx.origin || verified.data.chainId !== challenge.chainId) throw new Error('Invalid SIWE context');
  } catch { throw new ServiceError('PQ_WALLET_SIGNATURE', 401); }
  const token = randomBytes(32).toString('hex');
  const auth = { address: challenge.address, chainId: challenge.chainId, sessionHash: ctx.sessionHash, expiresAt: Date.now() + 3600000 };
  await ctx.store.activateWallet(`login-generation:${ctx.sessionHash}`, id, `active:${ctx.sessionHash}`, tokenId(token)!, auth);
  return { token, address: auth.address, chainId: auth.chainId, expiresAt: auth.expiresAt };
}

export async function walletSession(ctx: VerificationContext, token = '') {
  const id = tokenId(token);
  if (!id) return null;
  const parsed = authSchema.safeParse(await ctx.store.getData(`auth:${id}`));
  if (!parsed.success || parsed.data.sessionHash !== ctx.sessionHash || parsed.data.expiresAt <= Date.now() || await ctx.store.getData(`active:${ctx.sessionHash}`) !== id) return null;
  return { ...parsed.data, id };
}
export type WalletSession = NonNullable<Awaited<ReturnType<typeof walletSession>>>;
export async function revokeWallet(ctx: VerificationContext, token = '') {
  const auth = await walletSession(ctx, token);
  await ctx.store.deleteData(`login-generation:${ctx.sessionHash}`);
  await ctx.store.deleteData(`active:${ctx.sessionHash}`);
  if (auth) await ctx.store.deleteData(`auth:${auth.id}`);
}
export async function revokeLoginChallenge(ctx: VerificationContext, token = '') {
  const id = tokenId(token);
  if (id) await ctx.store.takeData(`login:${id}`, ctx.sessionHash);
}
export async function walletProfile(ctx: VerificationContext, address: string) {
  const value = await ctx.store.getData(profileKey(address));
  if (value === null) return null;
  const parsed = linkSchema.safeParse(value);
  if (!parsed.success || parsed.data.wallet.toLowerCase() !== address.toLowerCase()) throw new ServiceError('PQ_STORAGE', 503);
  return parsed.data;
}
export async function persistWalletLink(ctx: VerificationContext, auth: WalletSession, link: WalletLink) {
  const record = linkSchema.parse(link);
  if (record.wallet.toLowerCase() !== auth.address.toLowerCase()) throw new ServiceError('PQ_WALLET_SESSION', 401);
  await ctx.store.bindWallet(`auth:${auth.id}`, ctx.sessionHash, profileKey(record.wallet), `x-link:${digest(`x:${record.screenName.toLowerCase()}`)}`, `used-proof:${record.attestationHash}`, record);
}
