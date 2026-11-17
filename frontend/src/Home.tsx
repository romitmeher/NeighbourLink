import { useEffect, useState } from 'react'
import { api, money, timeIST } from './api'
import { Icons } from './Icons'
import { TorphText } from './TorphText'
import Reputation from './Reputation'
import { rentalPhoto } from './rentalPhoto'

interface HomeProps {
  user: any
  go: (route: string) => void
  openBooking: (id: number) => void
}

const SEARCH_EXAMPLES = [
  'Projector',
  'Camping Gear',
  'Power Drill',
  'Furniture Assembly',
  'Computer Setup',
  'Pressure Washer',
  'Sound System'
]

const POPULAR_RENTAL_CATEGORIES = [
  { name: 'Basic tools', icon: Icons.Wrench, count: 'Drills, saws, toolkits' },
  { name: 'Projectors/party equipment', icon: Icons.Sparkles, count: 'Screens, speakers, lights' },
  { name: 'Camping equipment', icon: Icons.Package, count: 'Tents, stoves, sleeping bags' },
  { name: 'Household equipment', icon: Icons.Home, count: 'Ladders, vacuums, steamers' }
]

const POPULAR_HELP_CATEGORIES = [
  { name: 'Furniture assembly', icon: Icons.Wrench, desc: 'Flatpack desks, beds, shelving' },
  { name: 'Computer setup', icon: Icons.Sparkles, desc: 'Wi-Fi, printers, OS upgrades' },
  { name: 'Cleaning', icon: Icons.Home, desc: 'Deep cleaning, balconies, move-in' },
  { name: 'Packing & organising', icon: Icons.Package, desc: 'Shifting boxes, wardrobe declutter' }
]

export default function Home({ user, go, openBooking }: HomeProps) {
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [recentListings, setRecentListings] = useState<any[]>([])
  const [providers, setProviders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchKind, setSearchKind] = useState<'rentals' | 'help'>('rentals')
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)

    Promise.all([
      api('/community/dashboard').catch(() => null),
      api('/rentals/listings').catch(() => []),
      api('/help/providers').catch(() => [])
    ])
      .then(([dash, listings, provs]) => {
        if (!alive) return
        if (dash) setDashboardData(dash)
        if (Array.isArray(listings)) setRecentListings(listings.slice(0, 4))
        if (Array.isArray(provs)) setProviders(provs.slice(0, 3))
      })
      .catch((err) => {
        if (alive) setError(err.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [user.id])

  const activeBookings =
    dashboardData?.bookings?.filter(
      (b: any) => !['completed', 'cancelled', 'declined', 'expired'].includes(b.status)
    ) || []

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (searchKind === 'rentals') {
      go('Rentals')
    } else {
      go('Local Help')
    }
  }

  return (
    <div className="home-experience" style={{ display: 'grid', gap: '2.5rem' }}>
      {/* Hero Section */}
      <section
        className="home-hero-card"
        style={{
          background: 'linear-gradient(135deg, var(--primary-light) 0%, var(--primary-light) 100%)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          padding: 'clamp(2rem, 5vw, 4rem)',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-card)'
        }}
      >
        <div style={{ maxWidth: '680px', position: 'relative', zIndex: 2 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-full)',
              padding: '0.3rem 0.85rem',
              fontSize: '0.8rem',
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              color: 'var(--primary)',
              marginBottom: '1.2rem',
              boxShadow: 'var(--shadow-xs)'
            }}
          >
            <Icons.MapPin size={14} />
            <span>{user.area || 'Your neighbourhood'}</span>
          </div>

          <h1 style={{ marginBottom: '1rem', color: 'var(--text-main)', lineHeight: 1.12 }}>
            Borrow what you need.{' '}
            <span style={{ color: 'var(--primary)', fontStyle: 'italic', fontWeight: 700 }}>
              Find help nearby.
            </span>
          </h1>

          <p
            style={{
              fontSize: 'clamp(1.05rem, 1.8vw, 1.25rem)',
              color: 'var(--text-muted)',
              marginBottom: '2rem',
              maxWidth: '540px'
            }}
          >
            Discover useful items to rent and people who can help, all in your neighbourhood.
          </p>

          {/* Search Box with Tab Switch */}
          <div
            className="hero-search-box"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1.5px solid var(--border)',
              borderRadius: 'var(--radius-xl)',
              padding: '0.6rem 0.8rem',
              boxShadow: 'var(--shadow-md)',
              display: 'grid',
              gap: '0.5rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div
                style={{
                  display: 'inline-flex',
                  backgroundColor: 'var(--bg-main)',
                  borderRadius: 'var(--radius-full)',
                  padding: '0.2rem',
                  border: '1px solid var(--border)'
                }}
              >
                <button
                  type="button"
                  onClick={() => setSearchKind('rentals')}
                  style={{
                    backgroundColor: searchKind === 'rentals' ? 'var(--primary)' : 'transparent',
                    color: searchKind === 'rentals' ? '#FFFFFF' : 'var(--text-muted)',
                    borderRadius: 'var(--radius-full)',
                    padding: '0.35rem 0.85rem',
                    fontSize: '0.82rem',
                    boxShadow: 'none',
                    border: 'none'
                  }}
                >
                  <Icons.Package size={14} />
                  <span>Rentals</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSearchKind('help')}
                  style={{
                    backgroundColor: searchKind === 'help' ? 'var(--primary)' : 'transparent',
                    color: searchKind === 'help' ? '#FFFFFF' : 'var(--text-muted)',
                    borderRadius: 'var(--radius-full)',
                    padding: '0.35rem 0.85rem',
                    fontSize: '0.82rem',
                    boxShadow: 'none',
                    border: 'none'
                  }}
                >
                  <Icons.Handshake size={14} />
                  <span>Local Help</span>
                </button>
              </div>

              <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 0.5rem' }}>
                <Icons.Search size={18} style={{ color: 'var(--text-muted)', marginRight: '0.5rem' }} />
                <input
                  type="text"
                  placeholder={`Search for items or services...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    border: 'none',
                    padding: '0.4rem',
                    boxShadow: 'none',
                    background: 'transparent',
                    minHeight: 'auto',
                    fontSize: '0.95rem'
                  }}
                />
              </div>

              <button
                type="button"
                onClick={handleSearchSubmit}
                style={{
                  borderRadius: 'var(--radius-full)',
                  padding: '0.55rem 1.4rem',
                  fontSize: '0.9rem'
                }}
              >
                <span>Search</span>
                <Icons.ArrowRight size={16} />
              </button>
            </div>

            {/* Rotating suggestions via TorphText */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.82rem',
                color: 'var(--text-muted)',
                padding: '0.2rem 0.5rem 0.3rem'
              }}
            >
              <span>Try searching for:</span>
              <button
                type="button"
                onClick={() => go(searchKind === 'rentals' ? 'Rentals' : 'Local Help')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--primary)',
                  boxShadow: 'none',
                  padding: 0,
                  fontWeight: 600,
                  fontSize: '0.82rem'
                }}
              >
                <TorphText words={SEARCH_EXAMPLES} intervalMs={2800} />
              </button>
            </div>
          </div>

          {/* Quick CTA Actions */}
          <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.6rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => go('Rentals')}
              className="btn-lg"
              style={{ borderRadius: 'var(--radius-full)' }}
            >
              <Icons.Package size={18} />
              <span>Explore Rentals</span>
              <Icons.ArrowUpRight size={16} />
            </button>
            <button
              onClick={() => go('Local Help')}
              className="btn-secondary btn-lg"
              style={{ borderRadius: 'var(--radius-full)' }}
            >
              <Icons.Handshake size={18} />
              <span>Find Local Help</span>
              <Icons.ArrowUpRight size={16} />
            </button>
          </div>
        </div>

        {/* Decorative Art Background */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: '-4%',
            bottom: '-10%',
            opacity: 0.18,
            pointerEvents: 'none'
          }}
        >
          <svg width="420" height="420" viewBox="0 0 24 24" fill="var(--primary)" stroke="none">
            <path d="M12 2L2 9.5V22h20V9.5L12 2zm0 3.2l7 5.25V20H5v-9.55l7-5.25z" />
          </svg>
        </div>
      </section>

      {/* Active User Bookings Next Steps (if logged in and has bookings) */}
      {activeBookings.length > 0 && (
        <section>
          <div className="page-header" style={{ marginBottom: '1rem' }}>
            <div className="page-header-title">
              <small>IN PROGRESS</small>
              <h2>Your next steps</h2>
            </div>
            <button className="btn-secondary btn-sm" onClick={() => go('Bookings')}>
              <span>View all bookings ({activeBookings.length})</span>
              <Icons.ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {activeBookings.map((b: any) => (
              <div
                key={b.id}
                className="booking-item-row"
                onClick={() => openBooking(b.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openBooking(b.id)
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--primary-light)',
                      color: 'var(--primary)',
                      display: 'grid',
                      placeItems: 'center'
                    }}
                  >
                    {b.kind === 'rental' ? <Icons.Package size={20} /> : <Icons.Handshake size={20} />}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="badge badge-primary">
                        {b.kind.toUpperCase()} #{b.id}
                      </span>
                      <span className="badge badge-neutral">
                        {b.status.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <strong style={{ fontSize: '1rem', display: 'block', marginTop: '0.2rem' }}>
                      {b.terms?.title || b.terms?.task_title || b.terms?.scope || 'Booking Workspace'}
                    </strong>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontSize: '1.15rem',
                      fontWeight: 750,
                      color: 'var(--primary)'
                    }}
                  >
                    {money(b.amount)}
                  </span>
                  <small style={{ display: 'block' }}>{timeIST(b.start_at)}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Popular Rental Categories */}
      <section>
        <div className="page-header" style={{ marginBottom: '1.2rem' }}>
          <div className="page-header-title">
            <small>EXPLORE EQUIPMENT</small>
            <h2>Popular rental categories</h2>
          </div>
          <button className="btn-subtle" onClick={() => go('Rentals')}>
            <span>See all rentals</span>
            <Icons.ArrowRight size={16} />
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.25rem'
          }}
        >
          {POPULAR_RENTAL_CATEGORIES.map((cat) => {
            const IconComponent = cat.icon
            return (
              <div
                key={cat.name}
                className="card card-interactive"
                onClick={() => go('Rentals')}
                role="button"
                tabIndex={0}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  padding: '1.4rem'
                }}
              >
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'var(--primary-light)',
                    color: 'var(--primary)',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0
                  }}
                >
                  <IconComponent size={24} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', marginBottom: '0.25rem' }}>{cat.name}</h3>
                  <small style={{ color: 'var(--text-muted)' }}>{cat.count}</small>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Featured Items Available Nearby */}
      {recentListings.length > 0 && (
        <section>
          <div className="page-header" style={{ marginBottom: '1.2rem' }}>
            <div className="page-header-title">
              <small>NEARBY YOU</small>
              <h2>Available to rent today</h2>
            </div>
            <button className="btn-secondary btn-sm" onClick={() => go('Rentals')}>
              <span>Browse marketplace</span>
              <Icons.ArrowRight size={16} />
            </button>
          </div>

          <div className="listing-grid" style={{ marginTop: 0 }}>
            {recentListings.map((item) => (
              <div
                key={item.id}
                className="listing-card"
                onClick={() => go('Rentals')}
                role="button"
                tabIndex={0}
                style={{ cursor: 'pointer' }}
              >
                <div className="listing-media">
                  {item.photos?.length > 0 ? (
                    <img
                     src={`/api/uploads/${item.photos[0]}`}
                     alt={item.title}
                     loading="lazy"
                     onError={(e) => { e.currentTarget.src = rentalPhoto(item.title, item.category) }}
                   />
                  ) : (
                    <img src={rentalPhoto(item.title, item.category)} alt={item.title} loading="lazy" />
                  )}
                  <div className="listing-price-badge">
                    {money(item.daily_price)} / day
                  </div>
                </div>

                <div className="listing-body">
                  <div className="listing-meta">
                    <span className="badge badge-primary">{item.category}</span>
                    <small style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Icons.MapPin size={12} />
                      {item.area}
                    </small>
                  </div>

                  <h3 className="listing-title">{item.title}</h3>
                  <p className="listing-description">{item.description}</p>

                  <Reputation userId={item.owner_id} kind="rental" />

                  <div className="listing-footer">
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      Condition: <strong>{item.condition}</strong>
                    </span>
                    <button
                      className="btn-sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        go('Rentals')
                      }}
                    >
                      <span>Check dates</span>
                      <Icons.ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Local Help Categories */}
      <section>
        <div className="page-header" style={{ marginBottom: '1.2rem' }}>
          <div className="page-header-title">
            <small>COMMUNITY TALENT</small>
            <h2>Local Help services</h2>
          </div>
          <button className="btn-subtle" onClick={() => go('Local Help')}>
            <span>Browse helpers</span>
            <Icons.ArrowRight size={16} />
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1.25rem'
          }}
        >
          {POPULAR_HELP_CATEGORIES.map((cat) => {
            const IconComponent = cat.icon
            return (
              <div
                key={cat.name}
                className="card card-interactive"
                onClick={() => go('Local Help')}
                role="button"
                tabIndex={0}
                style={{
                  cursor: 'pointer',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem'
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--primary-light)',
                    color: 'var(--primary)',
                    display: 'grid',
                    placeItems: 'center'
                  }}
                >
                  <IconComponent size={22} />
                </div>
                <h3 style={{ fontSize: '1.1rem' }}>{cat.name}</h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>{cat.desc}</p>
                <span
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 650,
                    color: 'var(--primary)',
                    marginTop: 'auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  Request quotes <Icons.ArrowRight size={12} />
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* How NeighbourLink Works */}
      <section
        style={{
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          padding: 'clamp(2rem, 4vw, 3.2rem)',
          boxShadow: 'var(--shadow-card)'
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto 2.5rem' }}>
          <small
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 750,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--primary)'
            }}
          >
            HOW IT WORKS
          </small>
          <h2 style={{ marginTop: '0.4rem', marginBottom: '0.75rem' }}>
            Simple steps. Clear agreements.
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            NeighbourLink keeps every booking transparent with digital agreements, condition photos,
            and secure test payments.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '2rem'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
                fontFamily: 'var(--font-heading)',
                fontWeight: 800,
                display: 'grid',
                placeItems: 'center',
                fontSize: '1rem'
              }}
            >
              1
            </div>
            <h3 style={{ fontSize: '1.15rem' }}>Discover & request</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Find an item available nearby or describe a task to receive quotes from trusted neighbours.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
                fontFamily: 'var(--font-heading)',
                fontWeight: 800,
                display: 'grid',
                placeItems: 'center',
                fontSize: '1rem'
              }}
            >
              2
            </div>
            <h3 style={{ fontSize: '1.15rem' }}>Review & agree</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Both parties digitally sign the same clear terms covering rental duration, condition, or scope
              before any checkout.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
                fontFamily: 'var(--font-heading)',
                fontWeight: 800,
                display: 'grid',
                placeItems: 'center',
                fontSize: '1rem'
              }}
            >
              3
            </div>
            <h3 style={{ fontSize: '1.15rem' }}>Handover & complete</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Record condition photos, message through your booking workspace, and download PDF receipts upon
              completion.
            </p>
          </div>
        </div>
      </section>

      {/* Owner / Helper CTA Banner */}
      <section
        style={{
          background: 'linear-gradient(135deg, var(--primary) 0%, #4127ce 100%)',
          color: '#FFFFFF',
          borderRadius: 'var(--radius-xl)',
          padding: 'clamp(2rem, 4vw, 3rem)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1.5rem',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <div style={{ maxWidth: '580px' }}>
          <h2 style={{ color: '#FFFFFF', marginBottom: '0.5rem' }}>
            Have tools gathering dust or skills to share?
          </h2>
          <p style={{ color: '#e3dbff', fontSize: '1.05rem' }}>
            List your items for daily rental or register as a local provider. Earn locally with simple 10%
            platform commission.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => go('Rentals')}
            style={{
              backgroundColor: '#FFFFFF',
              color: 'var(--primary)',
              borderRadius: 'var(--radius-full)'
            }}
          >
            <Icons.Plus size={16} />
            <span>List an item</span>
          </button>
          <button
            onClick={() => go('Local Help')}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: 'var(--radius-full)',
              boxShadow: 'none'
            }}
          >
            <Icons.User size={16} />
            <span>Become a provider</span>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border)',
          paddingTop: '2.5rem',
          paddingBottom: '2rem',
          color: 'var(--text-muted)',
          fontSize: '0.88rem',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: '1.5rem'
        }}
      >
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          <span
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 800,
              color: 'var(--text-main)',
              fontSize: '1.15rem'
            }}
          >
            NeighbourLink
          </span>
          <p style={{ maxWidth: '380px', fontSize: '0.82rem' }}>
            A vision-first neighbourhood marketplace for physical item rentals and local trusted help.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <button
            className="btn-subtle btn-sm"
            onClick={() => go('Rentals')}
            style={{ padding: 0 }}
          >
            Rentals Marketplace
          </button>
          <button
            className="btn-subtle btn-sm"
            onClick={() => go('Local Help')}
            style={{ padding: 0 }}
          >
            Local Help Services
          </button>
          <button
            className="btn-subtle btn-sm"
            onClick={() => go('Bookings')}
            style={{ padding: 0 }}
          >
            My Bookings
          </button>
          <button
            className="btn-subtle btn-sm"
            onClick={() => go('Dashboard')}
            style={{ padding: 0 }}
          >
            Dashboard
          </button>
        </div>

        <div style={{ width: '100%', fontSize: '0.78rem', color: 'var(--text-dim)', paddingTop: '1rem' }}>
          <span>© 2026 NeighbourLink · India Standard Time (IST) · All prices in INR</span>
        </div>
      </footer>
    </div>
  )
}
