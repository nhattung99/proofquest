export default function HomeChoices() {
  return <section className="home-hub" aria-labelledby="hero-title">
    <div className="hub-heading">
      <span className="eyebrow"><span className="live-dot" /> EXPLORE PROOFQUEST</span>
      <h1 id="hero-title">Verify Actions. <span>Earn Trust.</span></h1>
    </div>
    <div className="hub-grid">
      <a className="hub-card" href="#verify" aria-labelledby="hub-verify-title" aria-describedby="hub-verify-description">
        <div className="hub-card-heading"><span className="hub-symbol" aria-hidden="true">𝕏</span><span className="eyebrow muted">VERIFY · CONNECT</span></div>
        <h2 id="hub-verify-title">Verify &amp; Bind X</h2>
        <p id="hub-verify-description">Verify X ownership and bind your wallet.</p>
        <span className="hub-action">Open verification <span aria-hidden="true">→</span></span>
      </a>
      <a className="hub-card" href="https://primus-zktls-quiz-arena.vercel.app/" target="_blank" rel="noopener noreferrer" aria-labelledby="hub-quiz-title" aria-describedby="hub-quiz-description">
        <div className="hub-card-heading"><span className="hub-symbol hub-quiz-symbol" aria-hidden="true">?</span><span className="eyebrow muted">LEARN · PLAY</span></div>
        <h2 id="hub-quiz-title">Primus Quiz</h2>
        <p id="hub-quiz-description">Test your Primus and zkTLS knowledge.</p>
        <span className="hub-action">Open Quiz <span aria-hidden="true">↗</span></span>
        <span className="hub-tab-note">Opens in a new tab</span>
      </a>
    </div>
  </section>;
}
