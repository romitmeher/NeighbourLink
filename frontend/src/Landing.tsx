import { Icons } from './Icons'

type LandingProps = {
  user: { id: number; name?: string; area?: string }
  go: (route: string) => void
  openBooking?: (id: number) => void
}

export default function Landing({ user, go }: LandingProps) {
  const guest = user.id === 0
  return (
    <div className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <div className="landing-small-mark"><span className="landing-mark-dot" /> Made for the neighbourhood</div>
          <h1 id="landing-title">Good things<br />live next <br className="landing-mobile-break" />door<span className="landing-period">.</span></h1>
          <p>Borrow everyday items. Find a helping hand. Make more of what’s already around you.</p>
          <div className="landing-hero-actions">
            <button type="button" onClick={() => go('Rentals')}>{guest ? 'Join to explore' : 'Explore rentals'} <Icons.ArrowRight size={19} /></button>
            <button type="button" className="landing-action-alt" onClick={() => go('Local Help')}>{guest ? 'Join to find help' : 'Find local help'} <Icons.ArrowRight size={19} /></button>
          </div>
          <div className="landing-nearby"><Icons.MapPin size={17} /> Around {user.area || 'your neighbourhood'}</div>
        </div>
        <div className="landing-hero-art">
          <div className="landing-hero-arch" />
          <img src="/landing/neighbour-exchange.png" alt="Two neighbours exchanging a portable speaker at a Mumbai apartment" />
          <div className="landing-star" aria-hidden="true">✳</div>
          <span className="landing-photo-note">A little closer. A lot more possible.</span>
        </div>
      </section>

    </div>
  )
}
