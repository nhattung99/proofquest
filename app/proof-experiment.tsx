'use client';
import { useEffect, useRef, useState } from 'react';
import { PrimusZKTLS } from '@primuslabs/zktls-js-sdk';
import { z } from 'zod';
import { X_QUEST } from '../lib/x-quest';
import { diagnosticCode, friendlyError } from '../lib/diagnostics';
import { EXTENSION_URL, REWARDS_NOTICE } from '../lib/presentation';

type Phase = 'idle' | 'signing' | 'attesting' | 'verifying' | 'cancelled' | 'success';
type Failure = { code: string; stage: string; message: string };
const receiptSchema = z.object({ authenticity: z.literal(true), attemptBinding: z.literal(true), rewardsEnabled: z.literal(false), attestationHash: z.string().regex(/^0x[0-9a-f]{64}$/), timestamp: z.number().int().positive() });
type Receipt = z.infer<typeof receiptSchema>;

function Icon({ name, size = 20 }: { name: 'check' | 'shield' | 'arrow' | 'wallet' | 'browser' | 'close' | 'copy' | 'alert'; size?: number }) {
  const paths = { check: 'M5 12l4 4L19 6', shield: 'M12 3l8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6l8-3z M8 12l3 3 5-6', arrow: 'M4 12h16m-6-6 6 6-6 6', wallet: 'M3 6h17v14H3z M3 6V3h14v3 M15 11h5v5h-5z', browser: 'M3 4h18v16H3z M3 9h18 M6 6h1m2 0h1', close: 'M6 6l12 12M6 18 18 6', copy: 'M8 8h12v12H8z M16 8V4H4v12h4', alert: 'M12 8v5m0 3v1 M12 3 2 21h20L12 3z' };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
function XMark() { return <span className="x-mark" aria-hidden="true">𝕏</span>; }
async function responseJson(response: Response) {
  const body = await response.json();
  if (!response.ok) throw { code: body.code ?? 'PQ_CONFIG' };
  return body;
}
export default function ProofExperiment() {
  const sdk = useRef<PrimusZKTLS | null>(null);
  const initialization = useRef<Promise<void> | null>(null);
  const run = useRef({ id: 0, cancelled: false, controller: null as AbortController | null });
  const [extension, setExtension] = useState<'checking' | 'detected' | 'missing'>('checking');
  const [ready, setReady] = useState(false);
  const [publicPreview, setPublicPreview] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [setup, setSetup] = useState('Checking local configuration…');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    let mounted = true;
    let interrupted = false;
    try { interrupted = sessionStorage.getItem('proofquest-pending') === '1'; } catch { /* Storage is optional. */ }
    if (!initialization.current) {
      initialization.current = (async () => {
        const config = await responseJson(await fetch('/api/poc/config', { cache: 'no-store' }));
        const instance = new PrimusZKTLS();
        await instance.init(config.appId);
        sdk.current = instance;
      })();
    }
    void (async () => {
      await Promise.resolve();
      if (mounted) {
        setExtension(window.primus ? 'detected' : 'missing');
        if (interrupted) {
          try { sessionStorage.removeItem('proofquest-pending'); } catch { /* Storage is optional. */ }
          setFailure({ code: 'PQ_INTERRUPTED', stage: 'page-reload', message: 'The page reloaded before verification finished. Start a new attempt.' });
        }
      }
      try {
        await initialization.current;
        if (mounted) { setExtension('detected'); setReady(true); setSetup('Ready when you are. Your X screen name is disclosed during verification.'); }
      } catch (error) {
        if (!mounted) return;
        const code = diagnosticCode(error);
        if (code === 'PQ_LOCAL_ONLY') setPublicPreview(true);
        if (code === '00006') setExtension('missing');
        setSetup(code === 'PQ_LOCAL_ONLY' ? 'Public preview. Real verification runs in the local builder environment; public claims are disabled.' : code === 'PQ_CONFIG' || code === 'unknown' ? 'Setup required: check .env.local and restart the server.' : friendlyError(error, 'initialization'));
      }
    })();
    return () => { mounted = false; };
  }, []);
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); }
    catch { setCopied('Copy unavailable — select the text to copy.'); }
  }
  async function revokeAttempt() {
    const response = await fetch('/api/poc/cancel', { method: 'POST' });
    if (!response.ok) throw new Error('Cancellation not acknowledged');
  }
  async function cancel() {
    if (!busy) return;
    run.current.cancelled = true;
    run.current.controller?.abort();
    setPhase('cancelled'); setFailure(null);
    // Cancellation cannot retract a proof already accepted by the server. It
    // invalidates the pending attempt and ignores all late client results.
    try { await revokeAttempt(); } catch { /* Still ignore late results locally. */ }
    try { await sdk.current?.closeDataSourceTab(); } catch { /* Close manually if needed. */ }
  }
  async function prove() {
    if (!sdk.current || busy || !ready) return;
    const id = run.current.id + 1;
    run.current = { id, cancelled: false, controller: new AbortController() };
    const current = () => run.current.id === id && !run.current.cancelled;
    try { sessionStorage.setItem('proofquest-pending', '1'); } catch { /* Storage is optional. */ }
    setBusy(true); setFailure(null); setReceipt(null); setCopied(''); setPhase('signing');
    let stage = 'server-signing';
    try {
      // Let signing finish so cancellation can revoke even a late-issued cookie.
      const { signedRequest } = await responseJson(await fetch('/api/poc/request', { method: 'POST' }));
      if (!current()) { await revokeAttempt(); return; }
      stage = 'primus-attestation'; setPhase('attesting');
      const attestation = await sdk.current.startAttestation(signedRequest);
      if (!current()) return;
      stage = 'browser-signature';
      if (sdk.current.verifyAttestation(attestation) !== true) throw { code: 'PQ_SIGNATURE' };
      stage = 'server-verification'; setPhase('verifying');
      const result = await responseJson(await fetch('/api/poc/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attestation), signal: run.current.controller?.signal }));
      if (!current()) return;
      const verified = receiptSchema.parse(result);
      setReceipt(verified); setPhase('success');
    } catch (error) {
      if (current()) { setFailure({ code: diagnosticCode(error), stage, message: friendlyError(error, stage).split(' [stage:')[0] }); setPhase('idle'); }
    } finally { if (run.current.id === id) {
      setBusy(false);
      try { sessionStorage.removeItem('proofquest-pending'); } catch { /* Storage is optional. */ }
    } }
  }
  const step = receipt ? 4 : phase === 'verifying' ? 3 : phase === 'attesting' || phase === 'signing' ? 2 : extension === 'detected' ? 1 : 0;
  const progress = phase === 'signing' ? 'Preparing your secure verification request' : phase === 'attesting' ? 'Connect to X and generate your proof in Primus' : phase === 'verifying' ? 'Checking the signature and quest requirements' : '';
  return <>
    <header className="site-header"><a className="wordmark" href="#" aria-label="ProofQuest home"><span className="brand-icon"><Icon name="shield" size={19} /></span>Proof<span>Quest</span><span className="beta">LAB</span></a><nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#faq">FAQ</a><a className="nav-verify" href="#verify">Verify <Icon name="arrow" size={15} /></a></nav></header>
    <main>
      <section className="hero" aria-labelledby="hero-title"><div className="hero-copy"><div className="eyebrow"><span className="live-dot" /> REAL PROOFS. NO GUESSWORK.</div><h1 id="hero-title">Verify Actions.<br /><span>Earn Trust.</span></h1><p className="hero-description">Your X account. Your proof.<br />Verify ownership with Primus zkTLS — without handing us your login credentials.</p><div className="hero-tags"><span><Icon name="shield" size={14} /> Signature verified</span><span><Icon name="wallet" size={14} /> No gas required</span></div></div>
      <div className="proof-visual" aria-label="Your browser sends a zkTLS attestation to ProofQuest for independent verification"><div className="visual-grid" /><div className="floating-label">FROM ACTION TO EVIDENCE</div><div className="flow-node browser-node"><Icon name="browser" size={26} /><span>Your browser</span><small>Connect to X <XMark /></small></div><div className="flow-connector"><span /><Icon name="arrow" size={17} /><span /></div><div className="flow-node proof-node"><div className="shield-halo"><Icon name="shield" size={35} /></div><span>zkTLS attestation</span><small>Powered by Primus</small></div><div className="visual-result"><span className="check-circle"><Icon name="check" size={14} /></span><div>Proof, independently checked<small>Source → signature → account ownership</small></div></div></div></section>
      <section className="verification-section" id="verify" aria-label="Verify your X account"><ol className="journey" aria-label="Proof journey">{['Install extension', 'Connect X', 'Generate proof', 'Verified'].map((label, i) => <li key={label} className={i < step ? 'done' : i === step ? 'current' : ''} aria-current={i === step ? 'step' : undefined}><span className="step-number">{i < step ? <Icon name="check" size={13} /> : i + 1}</span><span>{label}</span>{i < 3 && <span className="step-line" />}</li>)}</ol>
        <div className="quest-card"><div className="quest-card-main"><div className="quest-icon"><XMark /></div><div className="quest-heading"><span className="eyebrow muted">ACCOUNT OWNERSHIP</span><h2>{X_QUEST.title}</h2><p>Turn account ownership into verifiable evidence.</p></div><span className="quest-label">01 / FIRST QUEST</span></div>
        <div className="quest-content"><div className="requirements"><div><Icon name="browser" /><span>Primus extension<small>Proof generation happens in your browser.</small></span></div><div><XMark /><span>Your X account<small>Sign in directly through the Primus flow.</small></span></div><div><Icon name="wallet" /><span>No gas transaction<small>No on-chain transaction to generate a proof.</small></span></div><div><Icon name="shield" /><span>Ownership, precisely<small>Verifies ownership only — not follows, posts, likes or reposts.</small></span></div></div>
        <div className="action-panel"><div className={`extension-pill ${extension}`} role="status"><span className="status-dot" />Primus extension: {extension === 'checking' ? 'checking…' : extension === 'detected' ? 'detected' : <><span>not detected</span><a href={EXTENSION_URL} target="_blank" rel="noreferrer">Install ↗</a></>}</div><p className="setup-text" role="status">{setup}</p><button className="primary-button" onClick={prove} disabled={!ready || busy}>{busy ? <><span className="spinner" />Verification in progress…</> : <>{publicPreview ? 'Local verification only' : 'Generate real proof'} <Icon name="arrow" size={18} /></>}</button>{extension === 'missing' && <p className="button-hint">Install and enable Primus, then reload to begin.</p>}{busy && <button className="text-button cancel-button" onClick={cancel} disabled={phase === 'cancelled'}>{phase === 'cancelled' ? 'Waiting for Primus to close…' : 'Cancel verification'}</button>}<div className="privacy-note"><Icon name="shield" size={14} /><span>We never ask for X passwords or cookies.<br />Your screen name is disclosed in the proof.</span></div></div></div>
        {busy && phase !== 'cancelled' && <div className="progress-panel" role="status" aria-live="polite"><div className="progress-heading"><span className="spinner" /><strong>{progress}</strong><small>Usually 15–60 seconds · allow time to sign in</small></div><ol className="live-timeline"><li className="done">Extension ready</li><li className={phase === 'verifying' ? 'done' : 'active'}>X connection & attestation</li><li className={phase === 'verifying' ? 'active' : ''}>Server verification</li></ol><p>The extension handles X login and proof generation together; the timeline advances when the SDK confirms completion.</p></div>}
        {phase === 'cancelled' && <div className="cancel-notice" role="status">Verification cancelled locally. {busy ? 'Close the Primus flow if it remains open. A new attempt is available once the current SDK operation ends.' : 'You can start a new attempt.'}</div>}
        {failure && <div className="error-callout" role="alert"><div className="callout-icon"><Icon name="alert" /></div><div className="callout-body"><h3>We couldn’t verify this proof.</h3><p>{failure.message}</p><p className="error-context">A verification or configuration issue does not mean your X account is invalid.</p><strong className="try-label">Try this</strong><ul><li>Check that Primus is enabled in this browser.</li><li>Wait 30 seconds, then start a fresh verification.</li><li>If it repeats, share the error code with the developer.</li></ul><div className="error-actions"><button className="code-chip" onClick={() => copy(`${failure.code} · ${failure.stage}`, 'Error code copied')} aria-label="Copy error code"><code>{failure.code}</code><Icon name="copy" size={14} /></button><small>{failure.stage}</small><button className="secondary-button" onClick={prove} disabled={!ready || busy}>Try again <Icon name="arrow" size={14} /></button></div></div><button className="icon-button dismiss" onClick={() => setFailure(null)} aria-label="Dismiss error"><Icon name="close" size={18} /></button></div>}
        {receipt && <div className="success-receipt" role="status"><div className="success-title"><span className="check-circle"><Icon name="check" size={20} /></span><div><span className="verified-badge">Verified</span><h3>Your X ownership proof passed.</h3><p>The server checked its signature, source, account field and verification attempt.</p></div></div><dl><div><dt>Attestation fingerprint <small>SHA-256</small></dt><dd><code>{receipt.attestationHash}</code><button className="icon-button" onClick={() => copy(receipt.attestationHash, 'Attestation hash copied')} aria-label="Copy attestation hash"><Icon name="copy" size={16} /></button></dd></div><div><dt>Attested at</dt><dd><time dateTime={new Date(receipt.timestamp).toISOString()}>{new Date(receipt.timestamp).toLocaleString()}</time></dd></div></dl><p className="receipt-limit">Local proof receipt · wallet ownership is not yet authenticated. Claims remain disabled.</p></div>}
        <span className="copy-feedback" role="status" aria-live="polite">{copied}</span>
        <div className="card-bottom"><span><span className="status-dot" /> INDEPENDENT SERVER VERIFICATION</span><details><summary>Technical details</summary><p>Template: <code>{X_QUEST.templateId}</code><br />Official SDK: @primuslabs/zktls-js-sdk · 0.3.15<br />Expected resolver parseType is unpinned. The proof output has no explicit template ID. Signing secrets stay on the server.</p></details></div></div>
      </section>
      <p className="rewards-notice"><Icon name="shield" size={16} />{REWARDS_NOTICE}</p>
      <section className="explainer" id="how-it-works"><div><span className="eyebrow muted">A SMALL PROOF. A CLEARER SIGNAL.</span><h2>From your account<br />to verifiable trust.</h2></div><ol><li><span>01</span><div><h3>Connect through Primus</h3><p>Your X login stays in the Primus flow. ProofQuest never requests your password or cookies.</p></div></li><li><span>02</span><div><h3>Generate an attestation</h3><p>Primus attests the account response. Your screen name is disclosed; this is not a fully private proof.</p></div></li><li><span>03</span><div><h3>Verify the evidence</h3><p>Our local server checks the signature and quest policy, then returns a local verification receipt.</p></div></li></ol></section>
      <section className="faq-section" id="faq"><span className="eyebrow muted">GOOD QUESTIONS</span><h2>Before you verify.</h2><div className="faq-list"><details><summary>What does this proof actually establish?</summary><p>It verifies the supported X account-ownership assertion through its account-settings response. It does not prove follows, posts, likes, reposts or unique humanity.</p></details><details><summary>Is my X account data private?</summary><p>Your screen name and attestation are processed for verification. ProofQuest does not collect your login credentials or persist the raw proof. Primus and browser diagnostics have their own disclosure properties.</p></details><details><summary>Do I need a wallet transaction?</summary><p>No gas transaction is needed. This local experiment uses a configured recipient address; it does not authenticate wallet ownership yet.</p></details><details><summary>Why is this still an experiment?</summary><p>Real proof acceptance, wallet authentication and durable replay protection must be validated before public reward claims can be enabled. This is an independent community project, without official Primus affiliation.</p></details></div></section>
    </main><footer className="site-footer"><a href="#" className="footer-brand">ProofQuest <span>v0.0.1</span></a><p>Independent community experiment. No official Primus affiliation.</p><div><a href="#how-it-works">How it works</a><a href="#faq">FAQ</a><a href="https://docs.primuslabs.xyz/enterprise/zk-tls-sdk/overview/" target="_blank" rel="noreferrer">Primus docs ↗</a></div></footer>
  </>;
}
