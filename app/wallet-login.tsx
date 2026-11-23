'use client';
import { useEffect, useRef, useState } from 'react';
import { diagnosticCode, friendlyError } from '../lib/diagnostics';

type Provider = { isMetaMask?: boolean; request(input: { method: string; params?: unknown[] }): Promise<unknown>; on?(event: string, listener: (...args: unknown[]) => void): void; removeListener?(event: string, listener: (...args: unknown[]) => void): void };
export type SignedInWallet = { address: string; chainId: number; expiresAt: number; link?: { wallet: string; screenName: string; attestationHash: string; timestamp: number } | null };
const walletShape = (value: unknown): value is SignedInWallet => {
  const data = value as SignedInWallet | null;
  return !!data && /^0x[0-9a-fA-F]{40}$/.test(data.address) && Number.isSafeInteger(data.chainId) && typeof data.expiresAt === 'number';
};
async function api(path: string, data?: unknown) {
  const response = await fetch(`/api/poc/wallet/${path}`, { method: data === undefined ? 'GET' : 'POST', ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }), cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const body = await response.json();
  if (!response.ok) throw { code: body.code };
  return body;
}
function timeout<T>(work: Promise<T>) {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject({ code: 'PQ_TIMEOUT' }), 60000); })]).finally(() => clearTimeout(timer));
}
export default function WalletLogin({ wallet, onChange, disabled }: { wallet: SignedInWallet | null; onChange(wallet: SignedInWallet | null): void; disabled: boolean }) {
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const [logoutFailed, setLogoutFailed] = useState(false);
  const provider = useRef<Provider | null>(null);
  const revision = useRef(0);
  const change = useRef(onChange);
  useEffect(() => { change.current = onChange; }, [onChange]);
  useEffect(() => {
    let mounted = true;
    const started = revision.current;
    const announced = (event: Event) => {
      const detail = (event as CustomEvent<{ info: { rdns: string }; provider: Provider }>).detail;
      if (detail?.info?.rdns === 'io.metamask') provider.current = detail.provider;
    };
    window.addEventListener('eip6963:announceProvider', announced);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    void api('session').then(value => { if (mounted && started === revision.current && walletShape(value)) change.current(value); }).catch(() => {});
    return () => { mounted = false; window.removeEventListener('eip6963:announceProvider', announced); };
  }, []);
  async function signOut(reason = 'Signed out. Your saved X binding is retained.') {
    revision.current++;
    change.current(null);
    setWorking(true);
    try { await api('logout', {}); setLogoutFailed(false); setNotice(reason); }
    catch { setLogoutFailed(true); setNotice('Server sign-out could not be confirmed. Retry sign out before signing in again.'); }
    finally { setWorking(false); }
  }
  useEffect(() => {
    if (!wallet) return;
    const injected = (window as Window & { ethereum?: Provider & { providers?: Provider[] } }).ethereum;
    const selected = provider.current ?? injected?.providers?.find(item => item.isMetaMask) ?? (injected?.isMetaMask ? injected : null);
    let valid = true;
    const changed = () => { if (valid) { valid = false; void signOut('Wallet account or network changed. Sign in again before binding X.'); } };
    selected?.on?.('accountsChanged', changed); selected?.on?.('chainChanged', changed); selected?.on?.('disconnect', changed);
    const timer = setTimeout(changed, Math.max(0, wallet.expiresAt - Date.now()));
    return () => { valid = false; clearTimeout(timer); for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) selected?.removeListener?.(event, changed); };
    // The authenticated identity determines the listener lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.address, wallet?.chainId, wallet?.expiresAt]);
  async function login() {
    if (working || disabled) return;
    if (logoutFailed) { await signOut(); return; }
    const injected = (window as Window & { ethereum?: Provider & { providers?: Provider[] } }).ethereum;
    const selected = provider.current ?? injected?.providers?.find(item => item.isMetaMask) ?? (injected?.isMetaMask ? injected : null);
    if (!selected) { setNotice('Install MetaMask in desktop Chrome or Edge, then reload.'); return; }
    provider.current = selected;
    revision.current++;
    setWorking(true); setNotice('Unlock MetaMask, select your account and sign the ProofQuest login message. No gas or transaction.');
    try {
      const accounts = await timeout(selected.request({ method: 'eth_requestAccounts' }));
      const address = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : '';
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw { code: 'PQ_WALLET_LOGIN' };
      const chain = await timeout(selected.request({ method: 'eth_chainId' }));
      const chainId = typeof chain === 'string' && /^0x[0-9a-f]+$/i.test(chain) ? Number.parseInt(chain, 16) : 0;
      const challenge = await api('challenge', { address, chainId });
      const hex = '0x' + Array.from(new TextEncoder().encode(challenge.message as string), byte => byte.toString(16).padStart(2, '0')).join('');
      const signature = await timeout(selected.request({ method: 'personal_sign', params: [hex, address] }));
      // Do not complete a login if MetaMask changed account/network while the
      // signature prompt was open. The server independently verifies the signer.
      const currentAccounts = await timeout(selected.request({ method: 'eth_accounts' }));
      const currentChain = await timeout(selected.request({ method: 'eth_chainId' }));
      if (!Array.isArray(currentAccounts) || String(currentAccounts[0]).toLowerCase() !== address.toLowerCase() || currentChain !== chain) throw { code: 'PQ_WALLET_SESSION' };
      const authenticated = await api('login', { signature });
      if (!walletShape(authenticated)) throw { code: 'PQ_WALLET_LOGIN' };
      const profile = await api('session');
      change.current(walletShape(profile) ? profile : authenticated); setNotice('Wallet signature verified. Use Verify & bind X to link your account.');
    } catch (error) {
      const rejected = (error as { code?: unknown })?.code === 4001;
      const code = diagnosticCode(error);
      setNotice(rejected ? 'MetaMask request declined. You can sign in again when ready.' : code === 'PQ_TIMEOUT' ? 'MetaMask did not respond in time. Close its pending request, unlock it and sign in again.' : friendlyError({ code: code === 'unknown' ? 'PQ_WALLET_LOGIN' : code }, 'wallet-login').split(' [stage:')[0]);
      // Invalidate an unfinished nonce and any uncertain login response.
      try { await api('logout', {}); } catch { setLogoutFailed(true); }
      change.current(null);
    } finally { setWorking(false); }
  }
  return <div className="wallet-controls">
    {wallet && <span className="wallet-address" title={wallet.address}>{wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}</span>}
    <button className="wallet-button" disabled={working || disabled} onClick={wallet ? () => void signOut() : login}>{working ? 'Check MetaMask…' : wallet || logoutFailed ? 'Sign out' : 'Login MetaMask'}</button>
    {notice && <div className="wallet-notice" role="status">{notice} <button aria-label="Dismiss wallet notice" onClick={() => setNotice('')}>×</button>{notice.startsWith('Install') && <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">Get MetaMask ↗</a>}</div>}
  </div>;
}
