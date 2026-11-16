import { useEffect, useState } from 'react'
import { api, money } from './api'
import { Icons } from './Icons'
import { rentalPhoto } from './rentalPhoto'

type HomeProps = {
  user: { id: number; name: string; area?: string }
  go: (route: string) => void
  openBooking: (id: number) => void
}

type Listing = {
  id: number
  title: string
  category: string
  area: string
  daily_price: number
  photos: number[]
}

type Provider = {
  user_id: number
  name: string
  categories: string[]
  area: string
  rate: number
  basis: string
}

type Booking = {
  id: number
  status: string
  title?: string
}

const categories = [
  { name: 'Party & event gear', description: 'The good stuff for a good time.', photo: '/rental-photos/speaker.png', className: 'party' },
  { name: 'Tools for the task', description: 'Get it done without buying it.', photo: '/rental-photos/drill.png', className: 'tools' },
  { name: 'Out there essentials', description: 'Take the weekend further.', photo: '/rental-photos/tent.png', className: 'outdoors' }
]

export default function Home({ user, go, openBooking }: HomeProps) {
  const guest = user.id === 0
  const [listings, setListings] = useState<Listing[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([
      api('/rentals/listings').catch(() => []),
      api('/help/providers').catch(() => []),
      guest ? Promise.resolve(null) : api('/community/dashboard').catch(() => null)
    ]).then(([items, people, dashboard]) => {
      if (!active) return
      setListings(Array.isArray(items) ? items.slice(0, 4) : [])
      setProviders(Array.isArray(people) ? people.slice(0, 3) : [])
      setBookings(Array.isArray(dashboard?.bookings)
        ? dashboard.bookings.filter((booking: Booking) =>
          !['completed', 'cancelled', 'declined', 'expired'].includes(booking.status)).slice(0, 2)
        : [])
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [user.id, guest])

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

      {bookings.length > 0 && (
        <section className="landing-bookings" aria-label="Your active bookings">
          <div><span className="landing-bookings-icon"><Icons.Calendar size={20} /></span><strong>You have {bookings.length} active {bookings.length === 1 ? 'booking' : 'bookings'}</strong></div>
          <div className="landing-booking-actions">
            {bookings.map((booking) => <button key={booking.id} type="button" onClick={() => openBooking(booking.id)}>{booking.title || 'Booking #' + booking.id} <Icons.ArrowRight size={16} /></button>)}
            <button type="button" onClick={() => go('Bookings')}>All bookings</button>
          </div>
        </section>
      )}

      <section className="landing-categories" aria-labelledby="landing-categories-title">
        <div className="landing-section-intro">
          <div><span className="landing-section-kicker">Discover around you</span><h2 id="landing-categories-title">The next thing you need<br />could be around the corner.</h2></div>
          <button type="button" className="landing-text-link" onClick={() => go('Rentals')}>See all rentals <Icons.ArrowRight size={18} /></button>
        </div>
        <div className="landing-category-grid">
          {categories.map((category) => (
            <button className={`landing-category ${category.className}`} type="button" key={category.name} onClick={() => go('Rentals')}>
              <span className="landing-category-title">{category.name}</span>
              <span className="landing-category-description">{category.description}</span>
              <img src={category.photo} alt="" loading="lazy" />
              <span className="landing-category-arrow"><Icons.ArrowRight size={22} /></span>
            </button>
          ))}
        </div>
      </section>

      <section className="landing-featured" aria-labelledby="landing-featured-title">
        <div className="landing-section-intro">
          <div><span className="landing-section-kicker">Borrow nearby</span><h2 id="landing-featured-title">Good finds. Short walks.</h2></div>
          <button type="button" className="landing-text-link" onClick={() => go('Rentals')}>Browse everything <Icons.ArrowRight size={18} /></button>
        </div>
        {loading ? <p role="status">Finding things near you…</p> : listings.length ? (
          <div className="landing-listing-grid">
            {listings.map((item) => (
              <button type="button" className="landing-listing" key={item.id} onClick={() => go('Rentals')}>
                <span className="landing-listing-photo">
                  <img src={item.photos?.length ? '/api/uploads/' + item.photos[0] : rentalPhoto(item.title, item.category)} alt="" loading="lazy" />
                </span>
                <span className="landing-listing-details"><strong>{item.title}</strong><span>{item.area} <i /> {money(item.daily_price)} / day</span></span>
                <span className="landing-listing-arrow"><Icons.ArrowRight size={18} /></span>
              </button>
            ))}
          </div>
        ) : <p className="landing-empty">New items are being added. Explore Rentals to see what is available now.</p>}
      </section>

      <section className="landing-help" aria-labelledby="landing-help-title">
        <div className="landing-help-copy">
          <span className="landing-section-kicker">A hand when you need one</span>
          <h2 id="landing-help-title">There’s talent<br />next door, too.</h2>
          <p>From packing before a move to setting up your new desk, find local people who know how to help.</p>
          <button type="button" onClick={() => go('Local Help')}>Meet local helpers <Icons.ArrowRight size={18} /></button>
        </div>
        <div className="landing-help-people">
          {providers.length ? providers.map((person, index) => (
            <button type="button" className="landing-person" key={person.user_id} onClick={() => go('Local Help')}>
              <span className="landing-person-avatar" style={{ background: ['#e3dbff', '#ffeeb0', '#ffd8c6'][index % 3] }}>{person.name[0]}</span>
              <span><strong>{person.name}</strong><small>{person.categories.slice(0, 2).join(' · ')}</small></span>
              <span className="landing-person-rate">{money(person.rate)} <small>/ {person.basis}</small></span>
            </button>
          )) : <div className="landing-help-art" aria-hidden="true">✳</div>}
        </div>
      </section>

      <footer className="landing-footer">
        <span>neighbour<span>link</span></span>
        <p>Good things happen when neighbours connect.</p>
        <button type="button" onClick={() => go('Rentals')}>Start exploring <Icons.ArrowRight size={18} /></button>
      </footer>
    </div>
  )
}
