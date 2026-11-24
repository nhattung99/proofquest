'use client';
import { useEffect, useRef, useState } from 'react';
import { PrimusZKTLS } from '@primuslabs/zktls-js-sdk';
import { z } from 'zod';
import { X_QUEST } from '../lib/x-quest';
import { diagnosticCode, friendlyError } from '../lib/diagnostics';
import HomeChoices from './home-choices';
import WalletLogin, { type SignedInWallet } from './wallet-login';
import { EXTENSION_URL, REWARDS_NOTICE } from '../lib/presentation';

type Phase = 'idle' | 'signing' | 'attesting' | 'verifying' | 'cancelled' | 'success';
type Failure = { code: string; stage: string; message: string; retryAt?: number };
const savedFailureKey = 'proofquest-safe-failure';
function bounded<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject({ code: 'PQ_TIMEOUT' }), milliseconds); })]).finally(() => clearTimeout(timer));
}
function countdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
}
const receiptSchema = z.object({ authenticity: z.literal(true), attemptBinding: z.literal(true), rewardsEnabled: z.literal(false), attestationHash: z.string().regex(/^0x[0-9a-f]{64}$/), timestamp: z.number().int().positive(), screenName: z.string().regex(/^[A-Za-z0-9_]{1,15}$/).optional(), walletAuthenticated: z.boolean().optional(), walletBound: z.boolean().optional(), walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional() });
type Receipt = z.infer<typeof receiptSchema>;

function Icon({ name, size = 20 }: { name: 'check' | 'shield' | 'arrow' | 'wallet' | 'browser' | 'close' | 'copy' | 'alert'; size?: number }) {
  const paths = { check: 'M5 12l4 4L19 6', shield: 'M12 3l8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6l8-3z M8 12l3 3 5-6', arrow: 'M4 12h16m-6-6 6 6-6 6', wallet: 'M3 6h17v14H3z M3 6V3h14v3 M15 11h5v5h-5z', browser: 'M3 4h18v16H3z M3 9h18 M6 6h1m2 0h1', close: 'M6 6l12 12M6 18 18 6', copy: 'M8 8h12v12H8z M16 8V4H4v12h4', alert: 'M12 8v5m0 3v1 M12 3 2 21h20L12 3z' };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
function XMark() { return <span className="x-mark" aria-hidden="true">𝕏</span>; }
async function responseJson(response: Response) {
  const body = await response.json();
  if (!response.ok) {
    const retryAfter = Number(response.headers.get('Retry-After') ?? body.retryAfter ?? 0);
    throw { code: body.code ?? 'PQ_CONFIG', retryAt: retryAfter > 0 ? Date.now() + Math.min(retryAfter, 86400) * 1000 : undefined };
  }
  return body;
}
export default function ProofExperiment() {
  const sdk = useRef<PrimusZKTLS | null>(null);
  const initialization = useRef<Promise<void> | null>(null);
  const run = useRef({ id: 0, cancelled: false, controller: null as AbortController | null });
  const [extension, setExtension] = useState<'checking' | 'detected' | 'missing'>('checking');
  const [ready, setReady] = useState(false);
  const [sessionBootstrapped, setSessionBootstrapped] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [setup, setSetup] = useState('Checking server configuration and the Primus connection (up to 12 seconds)…');
  const [needsReset, setNeedsReset] = useState(false);
  const [now, setNow] = useState(0);
  const [budget, setBudget] = useState<{ remaining: number; resetAt: number } | null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    try {
      if (failure) sessionStorage.setItem(savedFailureKey, JSON.stringify(failure));
    } catch { /* Only safe diagnostic metadata is stored, never proofs or account data. */ }
  }, [failure]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [copied, setCopied] = useState('');
  const [wallet, setWallet] = useState<SignedInWallet | null>(null);
  function walletChanged(next: SignedInWallet | null) {
    if (busy) void cancel();
    setReceipt(null); setWallet(next);
  }
  useEffect(() => {
    let mounted = true;
    let interrupted = false;
    try { interrupted = sessionStorage.getItem('proofquest-pending') === '1'; } catch { /* Storage is optional. */ }
    if (!initialization.current) {
      initialization.current = bounded((async () => {
        const configurationResponse = await fetch('/api/poc/config', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        // Finish the initial Set-Cookie response before MetaMask challenge
        // creation, so two bootstrap requests cannot replace each other's session.
        setSessionBootstrapped(true);
        const config = await responseJson(configurationResponse);
        const instance = new PrimusZKTLS();
        await instance.init(config.appId);
        sdk.current = instance;
      })(), 12000);
    }
    void (async () => {
      await Promise.resolve();
      if (mounted) {
        setNow(Date.now());
        setExtension(window.primus ? 'checking' : 'missing');
        try {
          const saved = JSON.parse(sessionStorage.getItem(savedFailureKey) ?? 'null');
          if (saved && typeof saved.stage === 'string' && diagnosticCode(saved) !== 'unknown') {
            const code = diagnosticCode(saved);
            setFailure({ code, stage: saved.stage.slice(0, 60), message: friendlyError({ code }, saved.stage).split(' [stage:')[0], retryAt: typeof saved.retryAt === 'number' ? saved.retryAt : undefined });
          }
          if (sessionStorage.getItem('proofquest-cancelled') === '1') { setPhase('cancelled'); sessionStorage.removeItem('proofquest-cancelled'); }
        } catch { /* Storage is optional. */ }
        if (interrupted) {
          try { sessionStorage.removeItem('proofquest-pending'); } catch { /* Storage is optional. */ }
          setFailure({ code: 'PQ_INTERRUPTED', stage: 'page-reload', message: 'The page reloaded before verification finished. Start a new attempt.' });
        }
      }
      try {
        await initialization.current;
        if (mounted) { setExtension('detected'); setReady(true); setSetup('Ready. Continue with X in the Primus extension.'); }
      } catch (error) {
        if (!mounted) return;
        setSessionBootstrapped(true);
        const code = diagnosticCode(error);
        if (code === '00006') setExtension('missing');
        setFailure({ code: code === 'unknown' ? 'PQ_TIMEOUT' : code, stage: 'initialization', message: friendlyError({ code: code === 'unknown' ? 'PQ_TIMEOUT' : code }, 'initialization').split(' [stage:')[0] });
        setNeedsReset(code === 'PQ_TIMEOUT' || code === 'unknown');
        setSetup(code === 'PQ_CONFIG' ? 'Verification is not configured yet. Contact the project developer.' : friendlyError(error, 'initialization'));
      }
    })();
    return () => { mounted = false; };
  }, []);
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); }
    catch { setCopied('Copy unavailable — select the text to copy.'); }
  }
  async function revokeAttempt() {
    const response = await fetch('/api/poc/cancel', { method: 'POST', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Cancellation not acknowledged');
  }
  function resetConnection() {
    try { sessionStorage.removeItem('proofquest-pending'); } catch { /* Optional storage. */ }
    window.location.reload();
  }
  async function cancel() {
    if (!busy) return;
    run.current.cancelled = true;
    run.current.controller?.abort();
    setBusy(false); setPhase('cancelled'); setFailure(null); setNeedsReset(true);
    try { sessionStorage.removeItem('proofquest-pending'); sessionStorage.removeItem(savedFailureKey); sessionStorage.setItem('proofquest-cancelled', '1'); } catch { /* Optional storage. */ }
    // Ignore late results immediately. SDK 0.3.15 exposes tab-close, not an abort
    // API; a new page realm is required before the next SDK operation.
    void revokeAttempt().catch(() => { setSetup('Stopped locally. Server cancellation could not be confirmed; the pending attempt expires within five minutes. A brief retry cooldown may remain.'); });
    void sdk.current?.closeDataSourceTab().catch(() => {});
  }
  async function prove() {
    if (needsReset) { resetConnection(); return; }
    if (!sdk.current || busy || !ready || (failure?.retryAt ?? 0) > Date.now()) return;
    const id = run.current.id + 1;
    run.current = { id, cancelled: false, controller: new AbortController() };
    const current = () => run.current.id === id && !run.current.cancelled;
    try { sessionStorage.setItem('proofquest-pending', '1'); } catch { /* Storage is optional. */ }
    try { sessionStorage.removeItem(savedFailureKey); } catch { /* Optional storage. */ }
    setNow(Date.now());
    setBusy(true); setFailure(null); setReceipt(null); setCopied(''); setPhase('signing');
    let stage = 'server-signing';
    try {
      // Let signing finish so cancellation can revoke even a late-issued cookie.
      const { signedRequest, rateLimit: rate } = await responseJson(await fetch('/api/poc/request', { method: 'POST', ...(wallet ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bind: true, address: wallet.address, chainId: wallet.chainId }) } : {}), signal: AbortSignal.timeout(15000) }));
      if (rate) setBudget(rate);
      if (!current()) { await revokeAttempt(); return; }
      stage = 'primus-attestation'; setPhase('attesting');
      let launchTimer: ReturnType<typeof setTimeout> | undefined;
      const launch = new Promise<never>((_, reject) => { launchTimer = setTimeout(() => reject({ code: 'PQ_EXTENSION_LAUNCH' }), 15000); });
      // This acknowledgement is a progress hint only, never evidence of X login.
      const acknowledged = (event: MessageEvent) => {
        if (event.source === window && event.data?.target === 'padoZKAttestationJSSDK' && ['getAttestationRes', 'startAttestationRes'].includes(event.data?.name)) clearTimeout(launchTimer);
      };
      window.addEventListener('message', acknowledged);
      let attestation;
      try { attestation = await bounded(Promise.race([sdk.current.startAttestation(signedRequest), launch]), 150000); }
      finally { clearTimeout(launchTimer); window.removeEventListener('message', acknowledged); }
      if (!current()) return;
      stage = 'browser-signature';
      if (sdk.current.verifyAttestation(attestation) !== true) throw { code: 'PQ_SIGNATURE' };
      stage = 'server-verification'; setPhase('verifying');
      const result = await responseJson(await fetch('/api/poc/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attestation), signal: AbortSignal.any([run.current.controller!.signal, AbortSignal.timeout(20000)]) }));
      if (!current()) return;
      const verified = receiptSchema.parse(result);
      if (wallet && (!verified.walletAuthenticated || !verified.walletBound || verified.walletAddress?.toLowerCase() !== wallet.address.toLowerCase())) throw { code: 'PQ_WALLET_SESSION' };
      if (wallet && verified.screenName) setWallet({ ...wallet, link: { wallet: wallet.address, screenName: verified.screenName, timestamp: verified.timestamp, attestationHash: verified.attestationHash } });
      setReceipt(verified); setPhase('success');
    } catch (error) {
      if (current()) {
        const raw = diagnosticCode(error);
        const code = raw === 'unknown' ? 'PQ_TIMEOUT' : raw;
        setFailure({ code, stage, message: friendlyError({ code }, stage).split(' [stage:')[0], retryAt: (error as { retryAt?: number })?.retryAt }); setPhase('idle');
        if (stage !== 'server-signing' || code === 'PQ_TIMEOUT') { setNeedsReset(true); void sdk.current?.closeDataSourceTab().catch(() => {}); }
        if (stage !== 'server-signing') void revokeAttempt().catch(() => {});
      }
    } finally { if (run.current.id === id) {
      setBusy(false);
      try { sessionStorage.removeItem('proofquest-pending'); } catch { /* Storage is optional. */ }
    } }
  }
  const step = receipt ? 4 : phase === 'verifying' ? 3 : extension === 'detected' ? 1 : 0;
  const retrySeconds = Math.max(0, (failure?.retryAt ?? 0) - now);
  const unavailable = busy || retrySeconds > 0 || (!ready && !needsReset);
  const progress = phase === 'signing' ? 'Preparing your secure verification request' : phase === 'attesting' ? 'Connect to X and generate your proof in Primus' : phase === 'verifying' ? 'Checking the signature and quest requirements' : '';
  return <>
    <header className="site-header"><a className="wordmark" href="#" aria-label="ProofQuest home"><span className="brand-icon"><Icon name="shield" size={19} /></span>Proof<span>Quest</span><span className="beta">LAB</span></a><nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#faq">FAQ</a><a className="nav-verify" href="#verify">Verify <Icon name="arrow" size={15} /></a><WalletLogin wallet={wallet} onChange={walletChanged} disabled={busy || (!wallet && !sessionBootstrapped)} /></nav></header>
    <main>
      <HomeChoices />
      <section className="verification-section" id="verify" aria-label="Verify your X account"><ol className="journey" aria-label="Proof journey">{['Install extension', 'Connect X', 'Generate proof', 'Verified'].map((label, i) => <li key={label} className={i < step ? 'done' : i === step ? 'current' : ''} aria-current={i === step ? 'step' : undefined}><span className="step-number">{i < step ? <Icon name="check" size={13} /> : i + 1}</span><span>{label}</span>{i < 3 && <span className="step-line" />}</li>)}</ol>
        <div className="quest-card"><div className="quest-card-main"><div className="quest-icon"><XMark /></div><div className="quest-heading"><span className="eyebrow muted">ACCOUNT OWNERSHIP</span><h2>{X_QUEST.title}</h2><p>{wallet ? wallet.link ? <>Bound X: @{wallet.link.screenName} · {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}</> : 'Wallet signed in. Generate a new X proof to bind your account.' : 'Turn account ownership into verifiable evidence.'}</p></div><span className="quest-label">01 / FIRST QUEST</span></div>
        <div className="quest-content"><div className="requirements"><div><Icon name="browser" /><span>Primus extension<small>Proof generation happens in your browser.</small></span></div><div><XMark /><span>Your X account<small>Sign in directly through the Primus flow.</small></span></div><div><Icon name="wallet" /><span>No gas transaction<small>No on-chain transaction to generate a proof.</small></span></div><div><Icon name="shield" /><span>Ownership, precisely<small>Verifies ownership only — not follows, posts, likes or reposts.</small></span></div></div>
        <div className="action-panel"><div className={`extension-pill ${extension}`} role="status"><span className="status-dot" />Primus extension: {extension === 'checking' ? 'checking…' : extension === 'detected' ? 'detected' : <><span>not detected</span></>}</div><a className="install-link" href={EXTENSION_URL} target="_blank" rel="noreferrer">Install Primus extension ↗</a><p className="setup-text" role="status">{setup}</p><button className="primary-button" onClick={prove} disabled={unavailable}>{busy ? <><span className="spinner" />Verification in progress…</> : <>{needsReset ? 'Reset connection & retry' : wallet ? 'Verify & bind X' : 'Generate real proof'} <Icon name="arrow" size={18} /></>}</button>{!ready && !needsReset && extension !== 'checking' && <button className="text-button" onClick={resetConnection}>Recheck connection</button>}{extension === 'missing' && <p className="button-hint">Install and enable Primus, then reload to begin.</p>}{busy && <button className="text-button cancel-button" onClick={cancel} disabled={phase === 'cancelled'}>{phase === 'cancelled' ? 'Waiting for Primus to close…' : 'Cancel verification'}</button>}<div className="privacy-note"><Icon name="shield" size={14} /><span>We never ask for X passwords or cookies.<br />{wallet ? <>Recipient: <code>{wallet.address}</code><br />By clicking Verify & bind X, you agree to save your wallet, X screen name and proof fingerprint.</> : <>Your screen name is disclosed in the proof. Login MetaMask to bind it to a wallet.</>}</span></div></div></div>
        {busy && phase !== 'cancelled' && <div className="progress-panel" role="status" aria-live="polite"><div className="progress-heading"><span className="spinner" /><strong>{progress}</strong><small>No extension response: 15-second timeout · whole flow: 150-second timeout</small></div><ol className="live-timeline"><li className="done">Extension ready</li><li className={phase === 'verifying' ? 'done' : 'active'}>X connection & attestation</li><li className={phase === 'verifying' ? 'active' : ''}>Server verification</li></ol><p>The extension handles X login and proof generation together; the timeline advances when the SDK confirms completion.</p></div>}
        {phase === 'cancelled' && <div className="cancel-notice" role="status">Verification cancelled. Close any remaining Primus tab. Reset connection & retry reloads a clean SDK session; cancellation is not a verification failure.</div>}
        {failure && <div className="error-callout" role="alert"><div className="callout-icon"><Icon name="alert" /></div><div className="callout-body"><h3>We couldn’t verify this proof.</h3><p>{failure.message}</p><p className="error-context">A verification or configuration issue does not mean your X account is invalid.</p>{failure.retryAt && <p className="retry-countdown" role="timer">{retrySeconds > 0 ? `Try again in ${countdown(retrySeconds)}` : 'You can try again now.'}</p>}<strong className="try-label">Try this</strong><ul><li>Check that Primus is enabled in this browser.</li><li>{failure.code === 'PQ_RATE_LIMIT' ? 'Wait for the rate limit to reset before trying again.' : 'Wait 30 seconds, then start a fresh verification.'}</li><li>If it repeats, <a href="https://github.com/nhattung99/proofquest/issues/new" target="_blank" rel="noreferrer">report this error on GitHub</a>. Share only the error code, not your proof or secrets.</li></ul><div className="error-actions"><button className="code-chip" onClick={() => copy(`${failure.code} · ${failure.stage}`, 'Error code copied')} aria-label="Copy error code"><code>{failure.code}</code><Icon name="copy" size={14} /></button><small>{failure.stage}</small><button className="secondary-button" onClick={prove} disabled={unavailable}>{needsReset ? 'Reset connection & retry' : 'Try again'} <Icon name="arrow" size={14} /></button></div></div><button className="icon-button dismiss" onClick={() => { setFailure(null); try { sessionStorage.removeItem(savedFailureKey); } catch { /* Optional storage. */ } }} aria-label="Dismiss error"><Icon name="close" size={18} /></button></div>}
        {receipt && <div className="success-receipt" role="status"><div className="success-title"><span className="check-circle"><Icon name="check" size={20} /></span><div><span className="verified-badge">Verified</span><h3>Your X ownership proof passed.</h3>{receipt.screenName && <p>Verified account: @{receipt.screenName}</p>}<p>The server checked its signature, source, account field and verification attempt.</p></div></div><dl><div><dt>Attestation fingerprint <small>SHA-256</small></dt><dd><code>{receipt.attestationHash}</code><button className="icon-button" onClick={() => copy(receipt.attestationHash, 'Attestation hash copied')} aria-label="Copy attestation hash"><Icon name="copy" size={16} /></button></dd></div><div><dt>Attested at</dt><dd><time dateTime={new Date(receipt.timestamp).toISOString()}>{new Date(receipt.timestamp).toLocaleString()}</time></dd></div></dl><p className="receipt-limit">{receipt.walletBound ? <>X bound to authenticated wallet <code>{receipt.walletAddress}</code>. Claims remain disabled.</> : <>Proof receipt · wallet ownership is not yet authenticated. Claims remain disabled.</>}</p></div>}
        <details className="receipt-preview"><summary>Preview a successful receipt (example)</summary><p>Illustration only — this is not a verified proof.</p><dl><dt>Status</dt><dd>Verified (example)</dd><dt>Account</dt><dd>@example_user (example)</dd><dt>Attestation fingerprint · SHA-256</dt><dd>A fingerprint of your verified proof appears here.</dd><dt>Attested at</dt><dd>The signed proof time appears here.</dd></dl><p>This example does not authenticate a wallet. Reward claims remain disabled.</p></details>{budget && <p className="budget-note">Anti-abuse request allowance: {budget.remaining} remaining until {new Date(budget.resetAt).toLocaleTimeString()}. This is not a count of successful proofs or Primus credits.</p>}<span className="copy-feedback" role="status" aria-live="polite">{copied}</span>
        <div className="card-bottom"><span><span className="status-dot" /> INDEPENDENT SERVER VERIFICATION</span><details><summary>Technical details</summary><p>Template: <code>{X_QUEST.templateId}</code><br />Official SDK: @primuslabs/zktls-js-sdk · 0.3.15<br />The SDK loads the template configuration by ID. The resolver parsing-mode field (parseType) has no separately pinned expected value. The proof output has no explicit template ID. Signing secrets stay on the server.</p></details></div></div>
      </section>
      <p className="rewards-notice"><Icon name="shield" size={16} />{REWARDS_NOTICE}</p>
      <section className="explainer" id="how-it-works"><div><span className="eyebrow muted">A SMALL PROOF. A CLEARER SIGNAL.</span><h2>From your account<br />to verifiable trust.</h2></div><ol><li><span>01</span><div><h3>Connect through Primus</h3><p>Your X login stays in the Primus flow. ProofQuest never requests your password or cookies.</p></div></li><li><span>02</span><div><h3>Generate an attestation</h3><p>Primus attests the account response. Your screen name is disclosed; this is not a fully private proof.</p></div></li><li><span>03</span><div><h3>Verify the evidence</h3><p>Our server checks the signature and quest policy, then returns a verification receipt.</p></div></li></ol></section>
      <section className="faq-section" id="faq"><span className="eyebrow muted">GOOD QUESTIONS</span><h2>Before you verify.</h2><div className="faq-list"><details><summary>What are zkTLS and an attestation?</summary><p>zkTLS creates verifiable evidence from a secure website response. An attestation is that signed evidence. ProofQuest checks it before showing Verified. The extension does not report a separate X login event; Connect X stays pending until the proof is returned.</p></details><details><summary>What does this proof actually establish?</summary><p>It verifies the supported X account-ownership assertion through its account-settings response. It does not prove follows, posts, likes, reposts or unique humanity.</p></details><details><summary>Is my X account data private?</summary><p>Your screen name and attestation are processed for verification. ProofQuest does not collect your login credentials or persist the raw proof. If you explicitly bind X, it stores the wallet address, X screen name, proof fingerprint and attestation time so the link survives sign-out. Primus and browser diagnostics have their own disclosure properties.</p></details><details><summary>Do I need a wallet transaction?</summary><p>No gas transaction is needed. Login MetaMask signs a one-time, domain-bound sign-in message; it never approves tokens. Verify & bind X generates a new Primus proof addressed to your authenticated wallet. Anonymous proof generation remains available.</p></details><details><summary>Why is this still an experiment?</summary><p>Public verification checks your real attestation. MetaMask wallet authentication and X screen-name binding are available. Reward claims remain disabled. Screen names can change or be reassigned; this template does not provide an immutable X user ID. This is an independent community project, without official Primus affiliation.</p></details></div></section>
    </main><footer className="site-footer"><a href="#" className="footer-brand">ProofQuest <span>v0.0.1</span></a><p>Independent community experiment. No official Primus affiliation.</p><div><a href="#how-it-works">How it works</a><a href="#faq">FAQ</a><a href="https://docs.primuslabs.xyz/enterprise/zk-tls-sdk/overview/" target="_blank" rel="noreferrer">Primus docs ↗</a></div></footer>
  </>;
}
