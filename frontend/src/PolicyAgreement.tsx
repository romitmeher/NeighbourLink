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
        <p className="policy-draft">Draft for legal review · Version 17 November 2026</p>
        <h2>Terms of service and safety</h2>
        <h3>1. About NeighbourLink</h3>
        <p>NeighbourLink helps people find neighbours offering rental items and local help. Users decide whether to contact, meet, lend to, rent from, or hire one another. A listing, rating, or profile is not a guarantee of identity, character, safety, skill, or quality.</p>
        <h3>2. Meeting and home visits</h3>
        <p>Meeting someone or allowing them into your home can involve risks, including injury, theft, property damage, harassment, or other misconduct. Consider meeting in a public place first, checking references, telling someone you trust, and keeping valuables secure. Do not proceed if you feel unsafe. In an emergency, contact local emergency services.</p>
        <h3>3. User responsibilities</h3>
        <p>Provide accurate information, describe items and services honestly, agree on the work, costs, timing and handover beforehand, and respect other people and their property. Users are responsible for their own conduct and for following applicable law. Report unsafe or misleading behaviour to NeighbourLink.</p>
        <h3>4. Verification, bookings and payments</h3>
        <p>NeighbourLink does not promise that every user has been identity checked or background checked. Booking details and agreements may be recorded in the app. The current payment flow is a demonstration: test payments do not move real money. Users should not rely on it as proof that a real payment has been made.</p>
        <h3>5. Risk and limits of responsibility</h3>
        <p>NeighbourLink cannot supervise every interaction or guarantee your safety, the condition of an item, or the quality or outcome of a service. To the extent permitted by applicable law, users are responsible for risks arising from their own interactions and arrangements with other users. Nothing in these terms removes rights or responsibilities that cannot legally be excluded, including any liability applicable to NeighbourLink under law.</p>
        <h3>6. Problems and reports</h3>
        <p>Users can use available reporting and dispute features to raise concerns. NeighbourLink may review reports and take action it considers appropriate, but cannot guarantee a particular outcome, reimbursement, or recovery. For support, contact NeighbourLink at <a href="tel:+919823878299">+91 98238 78299</a>.</p>
        <h2>Privacy notice</h2>
        <h3>7. Information we use</h3>
        <p>Information may include your name, email address, phone number, approximate area, account and profile details, photos, listings, service requests, booking details, messages, reviews, reports, and records of agreements and demo transactions. Information is provided by you or generated when you use the service.</p>
        <h3>8. Why we use and share it</h3>
        <p>We use information to operate accounts, display listings, connect users, manage bookings and messages, respond to reports, protect the service, and meet applicable obligations. Public profile and listing information can be visible to other users; booking and request details may be shared with the relevant participants. Hosting, database, and other service providers may process information for the service, and information may be disclosed when legally required.</p>
        <h3>9. Storage, choices and contact</h3>
        <p>We keep information for as long as needed for the service and applicable legal, security, and dispute purposes. You can ask about access, correction, or deletion by contacting <a href="tel:+919823878299">+91 98238 78299</a>. Some records may need to be retained. We use security measures but cannot guarantee absolute security.</p>
        <h3>10. Changes</h3>
        <p>We may update these documents as the service or applicable requirements change. We will provide notice and request a new agreement when appropriate.</p>
        <p className="policy-end">End of terms and privacy notice</p>
      </div>
      <p className="policy-hint" aria-live="polite">{reachedEnd ? 'You’ve reached the end.' : 'Scroll to the end to enable agreement.'}</p>
      {requireAgreement && <label className="policy-check"><input type="checkbox" disabled={!reachedEnd} checked={checked} onChange={(event) => setChecked(event.target.checked)} /><span>I agree to the Terms of Service and acknowledge the Privacy Notice.</span></label>}
      <button type="button" disabled={!reachedEnd || (requireAgreement && !checked)} onClick={onRead}>{requireAgreement ? 'Agree and continue' : 'Return to sign in'} →</button>
      <button type="button" className="auth-back-link" onClick={onBack}>← Back without finishing</button>
    </div>
  </main>
}
