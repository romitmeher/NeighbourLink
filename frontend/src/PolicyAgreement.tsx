import PolicyText from './PolicyText'
import { useEffect, useRef, useState } from 'react'
export default function PolicyAgreement({ onRead, onBack, requireAgreement = false }: { onRead: () => void; onBack: () => void; requireAgreement?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [reachedEnd, setReachedEnd] = useState(false)
  const [checked, setChecked] = useState(false)

  function checkEnd() {
    const box = scrollRef.current
    if (box && box.scrollTop + box.clientHeight >= box.scrollHeight - 8) setReachedEnd(true)
  }

  useEffect(() => { checkEnd() }, [])

  return <main className="policy-page">
    <div className="policy-card">
      <div className="policy-header"><span>neighbour<span>link</span></span><small>BEFORE YOU START</small></div>
      <h1>Let’s look out<br />for each other.</h1>
      <p className="policy-intro">Please read the terms and privacy notice before using NeighbourLink. Scroll to the end to continue.</p>
      <div ref={scrollRef} className="policy-scroll" tabIndex={0} onScroll={checkEnd} role="region" aria-label="Terms and privacy notice">
        <PolicyText />
      </div>
      <p className="policy-hint" aria-live="polite">{reachedEnd ? 'You’ve reached the end.' : 'Scroll to the end to enable agreement.'}</p>
      {requireAgreement && <label className="policy-check"><input type="checkbox" disabled={!reachedEnd} checked={checked} onChange={(event) => setChecked(event.target.checked)} /><span>I agree to the Terms of Service and acknowledge the Privacy Notice.</span></label>}
      <button type="button" disabled={!reachedEnd || (requireAgreement && !checked)} onClick={onRead}>{requireAgreement ? 'Agree and continue' : 'Return to sign in'} →</button>
      <button type="button" className="auth-back-link" onClick={onBack}>← Back without finishing</button>
    </div>
  </main>
}
