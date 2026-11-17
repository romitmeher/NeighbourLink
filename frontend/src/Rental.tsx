import { FormEvent, useEffect, useState } from 'react'
import { api, timeIST } from './api'
import BlockedDates from './BlockedDates'
import Reputation from './Reputation'
import { Icons } from './Icons'
import { rentalPhoto } from './rentalPhoto'
import CommunityFaces from './CommunityFaces'

type User = { id: number; name: string }
type Props = { user: User; openBooking: (id: number) => void }
type Listing = {
  id: number
  owner_id: number
  title: string
  category: string
  description: string
  area: string
  condition: string
  daily_price: number
  photos: number[]
  status: string
  defects: string
  accessories: string
  restrictions: string
  serial?: string
  pickup_instructions?: string
  return_instructions?: string
}

const initialCategories = [
  'Basic tools',
  'Projectors/party equipment',
  'Camping equipment',
  'Household equipment'
]

const money = (paise: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100)

const dateHere = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())

const errorText = (err: unknown) =>
  err instanceof Error ? err.message : 'Request failed. Please try again.'

async function upload(files: File[], bookingId?: number): Promise<number[]> {
  const ids = []
  for (const file of files) {
    const body = new FormData()
    body.append('file', file)
    body.append('public', bookingId ? 'false' : 'true')
    if (bookingId) body.append('booking_id', String(bookingId))
    const result = await api('/uploads', 'POST', body)
    ids.push(result.id)
  }
  return ids
}

const editorFields = [
  ['title', 'Item name', 'e.g. Bosch Professional Hammer Drill'],
  ['description', 'Description', 'Provide details on specifications, features, and optimal use cases'],
  ['area', 'Approximate area', 'e.g. Dadar West, Mumbai'],
  ['condition', 'Condition', 'e.g. Excellent, lightly used, fully functional'],
  ['defects', 'Known defects (optional)', 'Minor scratches on casing, no functional issues'],
  ['accessories', 'Included accessories', 'Hard case, 5 masonry drill bits, chuck key'],
  ['restrictions', 'Usage restrictions', 'Indoor use only, not for heavy commercial demolition'],
  ['serial', 'Serial number (private to booking)', 'SN-8492018471'],
  ['pickup_instructions', 'Private pickup instructions', 'Available between 9 AM and 7 PM near landmark'],
  ['return_instructions', 'Private return instructions', 'Return clean with all bit attachments inside case']
] as const

function Editor({
  item,
  categories,
  done,
  cancel
}: {
  item?: Listing
  categories: string[]
  done: () => void
  cancel: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const body = new FormData(e.currentTarget)
    setError('')
    setBusy(true)
    try {
      const extras = body
        .getAll('images')
        .filter((v): v is File => v instanceof File && v.size > 0)
      const photos = body.has('replace') ? [] : item?.photos || []
      if (photos.length + extras.length > 8) throw Error('Maximum 8 photos allowed.')

      const data = {
        ...Object.fromEntries(editorFields.map(([k]) => [k, body.get(k)])),
        category: body.get('category'),
        daily_price: Math.round(Number(body.get('daily_price')) * 100),
        status: body.get('status'),
        photos: [...photos, ...(await upload(extras))]
      }
      await api(item ? '/rentals/listings/' + item.id : '/rentals/listings', item ? 'PATCH' : 'POST', data)
      done()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <div>
            <h2 style={{ fontSize: '1.45rem', marginBottom: '0.2rem' }}>
              {item ? 'Edit rental listing' : 'List an item for rent'}
            </h2>
            <small>Set daily pricing, condition, accessories and private instructions</small>
          </div>
          <button
            type="button"
            className="btn-subtle btn-sm"
            onClick={cancel}
            aria-label="Close modal"
          >
            <Icons.X size={18} />
          </button>
        </div>

        <form onSubmit={save} style={{ display: 'grid', gap: '1.1rem' }}>
          {editorFields.map(([key, label, placeholder]) => (
            <label key={key}>
              <span>{label}</span>
              {['description', 'pickup_instructions', 'return_instructions'].includes(key) ? (
                <textarea
                  name={key}
                  defaultValue={item?.[key as keyof Listing] as string || ''}
                  placeholder={placeholder}
                  required={['description', 'pickup_instructions', 'return_instructions'].includes(key)}
                  rows={key === 'description' ? 3 : 2}
                />
              ) : (
                <input
                  name={key}
                  defaultValue={item?.[key as keyof Listing] as string || ''}
                  placeholder={placeholder}
                  required={['title', 'area', 'condition'].includes(key)}
                />
              )}
            </label>
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <label>
              <span>Category</span>
              <select name="category" defaultValue={item?.category || categories[0]}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Daily rent (₹ INR)</span>
              <input
                name="daily_price"
                type="number"
                step=".01"
                min=".01"
                max="20000"
                defaultValue={item ? item.daily_price / 100 : 250}
                required
              />
            </label>
          </div>

          <label>
            <span>Upload photos (up to 8)</span>
            <input name="images" type="file" multiple accept="image/jpeg,image/png,image/webp" />
          </label>

          {!!item?.photos.length && (
            <label>
              <input name="replace" type="checkbox" />
              <span>Replace existing {item.photos.length} photos</span>
            </label>
          )}

          <label>
            <span>Listing visibility</span>
            <select name="status" defaultValue={item?.status || 'published'}>
              <option value="published">Published (Visible to all neighbours)</option>
              <option value="paused">Paused (Temporarily hidden)</option>
              <option value="archived">Archived (Closed)</option>
            </select>
          </label>

          {error && <p role="alert">{error}</p>}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn-secondary" onClick={cancel}>
              Cancel
            </button>
            <button disabled={busy} className="btn-lg">
              <Icons.Check size={16} />
              <span>{busy ? 'Saving…' : 'Save listing'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DateForm({
  item,
  owner,
  done
}: {
  item: Listing
  owner: boolean
  done: (id?: number) => void
}) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api(
        '/rentals/listings/' + item.id + (owner ? '/blackouts' : '/requests'),
        'POST',
        { start, end }
      )
      done(owner ? undefined : result.id)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        marginTop: '1.2rem',
        padding: '1.2rem',
        backgroundColor: 'var(--bg-main)',
        border: '1.5px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-xs)'
      }}
    >
      <h4 style={{ fontSize: '1.05rem', marginBottom: '0.75rem' }}>
        {owner ? 'Block unavailable dates' : 'Select rental dates'}
      </h4>
      <form onSubmit={submit} style={{ display: 'grid', gap: '0.85rem' }}>
        <div className="rental-date-grid">
          <label>
            <span>Start date</span>
            <input
              type="date"
              min={dateHere()}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </label>
          <label>
            <span>Return date (exclusive)</span>
            <input
              type="date"
              min={start || dateHere()}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
          </label>
        </div>

        {days > 0 && (
          <div
            style={{
              padding: '0.65rem 0.85rem',
              backgroundColor: 'var(--primary-light)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.88rem',
              color: 'var(--primary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span>
              <strong>{days}</strong> billable {days === 1 ? 'day' : 'days'}
            </span>
            <strong style={{ fontSize: '1.1rem' }}>{money(days * item.daily_price)}</strong>
          </div>
        )}

        {error && <p role="alert">{error}</p>}

        <button disabled={busy || !(days > 0)} className="btn-lg">
          <Icons.Calendar size={16} />
          <span>{owner ? 'Block dates' : 'Send rental request'}</span>
        </button>
      </form>
    </div>
  )
}

export default function Rental({ user, openBooking }: Props) {
  const [mode, setMode] = useState<'discover' | 'mine'>('discover')
  const [items, setItems] = useState<Listing[]>([])
  const [categories, setCategories] = useState(initialCategories)
  const [edit, setEdit] = useState<Listing | 'new' | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [selectedItemDetails, setSelectedItemDetails] = useState<Listing | null>(null)
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('default')
  const [savedOnly, setSavedOnly] = useState(false)
  const savedKey = 'neighbourlink-saved-rentals-' + user.id
  const [saved, setSaved] = useState<number[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(savedKey) || '[]')
      return Array.isArray(stored) ? stored.filter((id) => Number.isInteger(id)) : []
    } catch {
      return []
    }
  })
  const filter = new URLSearchParams({ q: query.trim(), area: area.trim() }).toString()

  useEffect(() => {
    localStorage.setItem(savedKey, JSON.stringify(saved))
  }, [saved, savedKey])
  const [revision, refresh] = useState(0)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let live = true
    api('/community/categories?kind=rental')
      .then((x: any) => {
        if (live && Array.isArray(x)) setCategories(x)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    let live = true
    setBusy(true)
    setError('')
    const timer = window.setTimeout(() => {
      api(mode === 'mine' ? '/rentals/mine' : '/rentals/listings?' + filter)
      .then((rows: Listing[]) => {
        if (live) setItems(rows)
      })
      .catch((err: unknown) => {
        if (live) setError(errorText(err))
      })
      .finally(() => {
        if (live) setBusy(false)
      })
    }, mode === 'discover' ? 220 : 0)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [mode, filter, revision])

  const visibleItems = items.filter((item) =>
    mode === 'mine' || ((!category || item.category === category) && (!savedOnly || saved.includes(item.id)))
  )
  if (sort === 'price' && mode === 'discover') visibleItems.sort((a, b) => a.daily_price - b.daily_price)

  return (
    <div className="rentals-page">
      <div className="page-header rentals-heading">
        <div className="page-header-title">
          <h1>Rentals {!busy && !error && mode === 'discover' && (
            <span className="rental-count">{visibleItems.length} {visibleItems.length === 1 ? 'item' : 'items'}</span>
          )}</h1>
          <p>Borrow equipment from people near you.</p>
        </div>
        <div className="rentals-heading-side">
          <CommunityFaces />
          <button onClick={() => setEdit('new')}><Icons.Plus size={18} /> List an item</button>
        </div>
      </div>

      <div className="segmented-tabs" aria-label="Rental views" role="group">
        {(['discover', 'mine'] as const).map((view) => (
          <button key={view} className="segmented-tab" aria-pressed={mode === view} onClick={() => {
            setMode(view)
            setEdit(null)
            setExpanded(null)
          }}>
            {view === 'discover' ? 'Browse items' : 'My listings'}
          </button>
        ))}
      </div>

      {notice && <p role="status">{notice}</p>}

      {edit && (
        <Editor
          key={edit === 'new' ? 'new' : edit.id}
          item={edit === 'new' ? undefined : edit}
          categories={categories}
          cancel={() => setEdit(null)}
          done={() => {
            setEdit(null)
            setMode('mine')
            setNotice('Listing saved successfully.')
            refresh((n) => n + 1)
          }}
        />
      )}

      {/* Filter toolbar in discover mode */}
      {mode === 'discover' && (
        <div className="rental-filters">
          <label className="rental-search">
            <Icons.Search size={18} />
            <input type="search" aria-label="Search items" placeholder="Tent, projector, drill, ladder…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="rental-chips" role="group" aria-label="Category">
            {['', ...categories].map((name) => (
              <button key={name} type="button" className="rental-chip" aria-pressed={category === name} onClick={() => setCategory(name)}>
                {name || 'All'}
              </button>
            ))}
          </div>
          <div className="rental-filter-options">
            <input aria-label="Filter by area" placeholder="Area" value={area} onChange={(event) => setArea(event.target.value)} />
            <select aria-label="Sort items" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="default">Default order</option>
              <option value="price">Lowest price</option>
            </select>
            <button type="button" className="rental-chip" aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}>Saved</button>
          </div>
        </div>
      )}

      {busy ? (
        <p role="status">Loading items…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : visibleItems.length === 0 ? (
        <div className="empty-state" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary)',
              margin: '0 auto 1rem',
              display: 'grid',
              placeItems: 'center'
            }}
          >
            <Icons.Package size={28} />
          </div>
          <h3>{mode === 'mine' ? 'You have no listings yet' : 'No items match your filters'}</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '0.4rem auto 1.5rem' }}>
            {mode === 'mine'
              ? 'Put your household tools, camping equipment or party gear to use by creating your first listing.'
              : 'Try clearing your filters or searching for another keyword.'}
          </p>
          {mode === 'discover' && (query || area || category || savedOnly) && (
            <button onClick={() => {
              setQuery('')
              setArea('')
              setCategory('')
              setSavedOnly(false)
            }}>Clear filters</button>
          )}
          {mode === 'mine' && (
            <button onClick={() => setEdit('new')}>
              <Icons.Plus size={16} />
              <span>List your first item</span>
            </button>
          )}
        </div>
      ) : (
        <div className={`listing-grid rental-grid ${mode === 'discover' && visibleItems.length === 4 && expanded === null ? 'rental-bento' : ''}`}>
          {visibleItems.map((item) => (
            <article className="listing-card" key={item.id}>
              <div className="rental-card-top">
                <span className="badge badge-primary">{item.category}</span>
                {mode === 'discover' && (
                  <button type="button" className="rental-save" aria-label={`Save ${item.title}`} aria-pressed={saved.includes(item.id)} onClick={() =>
                    setSaved((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])
                  }>
                    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
                    </svg>
                  </button>
                )}
              </div>
              <button type="button" className="listing-media rental-media" onClick={() => setSelectedItemDetails(item)} aria-label={`View ${item.title}`}>
                <img
  className="rental-photo"
  src={rentalPhoto(item.title, item.category)}
  alt=""
  loading="lazy"
/>
              </button>
              <div className="listing-body">
                <h3 className="listing-title">{item.title}</h3>
                <div className="listing-meta rental-meta">
                  <small><Icons.MapPin size={14} /> {item.area}</small>
                  <span className="listing-price-badge">{money(item.daily_price)} <small>/ day</small></span>
                </div>
                {item.description.startsWith('Fictional demonstration listing.') && (
                  <div className="rental-neighbour" title="Illustrative profile photo for this demo listing">
                    <img src={`/community-portraits/neighbour-${((item.id - 1) % 6) + 1}.png`} alt="" loading="lazy" />
                    <span>Demo neighbour</span>
                  </div>
                )}
                <p className="listing-description">{item.description}</p>

                <Reputation userId={item.owner_id} kind="rental" />

                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  <span>Condition: <strong>{item.condition}</strong></span>
                  {item.accessories && (
                    <span style={{ display: 'block', marginTop: '0.15rem' }}>
                      Accessories: {item.accessories}
                    </span>
                  )}
                </div>

                {mode === 'mine' && (
                  <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="badge badge-neutral">Status: {item.status}</span>
                      <button
                        className="btn-subtle btn-sm"
                        onClick={() => setEdit(item)}
                      >
                        <Icons.Edit size={14} />
                        <span>Edit</span>
                      </button>
                    </div>

                    <details style={{ marginTop: '0.75rem', fontSize: '0.82rem' }}>
                      <summary>Manage blocked dates</summary>
                      <BlockedDates listingId={item.id} />
                    </details>
                  </div>
                )}

                <div className="listing-footer">
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => setSelectedItemDetails(item)}
                  >
                    <span>View details</span>
                  </button>

                  <button
                    className="btn-sm"
                    onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  >
                    <Icons.Calendar size={14} />
                    <span>
                      {expanded === item.id
                        ? 'Close'
                        : item.owner_id === user.id
                        ? 'Block dates'
                        : 'Book dates'}
                    </span>
                  </button>
                </div>

                {expanded === item.id && (
                  <DateForm
                    item={item}
                    owner={item.owner_id === user.id}
                    done={(id) => {
                      if (id) {
                        openBooking(id)
                      } else {
                        setNotice('Dates blocked successfully.')
                        setExpanded(null)
                        refresh((n) => n + 1)
                      }
                    }}
                  />
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Item Details Modal */}
      {selectedItemDetails && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '680px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <span className="badge badge-primary">{selectedItemDetails.category}</span>
                <h2 style={{ fontSize: '1.6rem', marginTop: '0.4rem', marginBottom: '0.2rem' }}>
                  {selectedItemDetails.title}
                </h2>
                <small style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Icons.MapPin size={14} />
                  <span>{selectedItemDetails.area}</span>
                </small>
              </div>

              <button
                type="button"
                className="btn-subtle btn-sm"
                onClick={() => setSelectedItemDetails(null)}
                aria-label="Close details"
              >
                <Icons.X size={18} />
              </button>
            </div>

            {/* Gallery */}
            {selectedItemDetails.photos.length > 0 && (
              <div style={{ display: 'flex', gap: '0.65rem', overflowX: 'auto', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                {selectedItemDetails.photos.map((pid, idx) => (
                  <img
                    key={pid}
                    src={'/api/uploads/' + pid}
                    alt={`${selectedItemDetails.title} view ${idx + 1}`}
                    style={{
                      height: '180px',
                      borderRadius: 'var(--radius-md)',
                      objectFit: 'cover'
                    }}
                  />
                ))}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.85rem 1rem',
                backgroundColor: 'var(--primary-light)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1.2rem'
              }}
            >
              <span style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 600 }}>
                Daily Rental Fee
              </span>
              <strong style={{ fontSize: '1.35rem', color: 'var(--primary)' }}>
                {money(selectedItemDetails.daily_price)} / day
              </strong>
            </div>

            <div style={{ display: 'grid', gap: '0.85rem', fontSize: '0.92rem', lineHeight: 1.6 }}>
              <div>
                <strong style={{ display: 'block', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                  Description
                </strong>
                <p style={{ color: 'var(--text-muted)' }}>{selectedItemDetails.description}</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <strong style={{ display: 'block', color: 'var(--text-main)' }}>Condition</strong>
                  <span style={{ color: 'var(--text-muted)' }}>{selectedItemDetails.condition}</span>
                </div>
                {selectedItemDetails.defects && (
                  <div>
                    <strong style={{ display: 'block', color: 'var(--text-main)' }}>Known defects</strong>
                    <span style={{ color: 'var(--text-muted)' }}>{selectedItemDetails.defects}</span>
                  </div>
                )}
              </div>

              {selectedItemDetails.accessories && (
                <div>
                  <strong style={{ display: 'block', color: 'var(--text-main)' }}>Included accessories</strong>
                  <span style={{ color: 'var(--text-muted)' }}>{selectedItemDetails.accessories}</span>
                </div>
              )}

              {selectedItemDetails.restrictions && (
                <div>
                  <strong style={{ display: 'block', color: 'var(--text-main)' }}>Usage restrictions</strong>
                  <span style={{ color: 'var(--text-muted)' }}>{selectedItemDetails.restrictions}</span>
                </div>
              )}

              <Reputation userId={selectedItemDetails.owner_id} kind="rental" />
            </div>

            {/* Embedded booking form */}
            <DateForm
              item={selectedItemDetails}
              owner={selectedItemDetails.owner_id === user.id}
              done={(id) => {
                setSelectedItemDetails(null)
                if (id) {
                  openBooking(id)
                } else {
                  setNotice('Dates blocked.')
                  refresh((n) => n + 1)
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function RentalActions({
  bookingId,
  user,
  onChange
}: {
  bookingId: number
  user: User
  onChange: () => void
}) {
  const [booking, setBooking] = useState<any>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let alive = true
    api('/rentals/bookings/' + bookingId)
      .then((b: any) => {
        if (alive) setBooking(b)
      })
      .catch((e: unknown) => {
        if (alive) setError(errorText(e))
      })
    return () => {
      alive = false
    }
  }, [bookingId, revision])

  if (!booking) return <p role="status">{error || 'Loading rental details…'}</p>

  const owner = user.id === booking.provider_id
  const participant = owner || user.id === booking.customer_id
  const actions: Record<string, string> = {}

  if (participant) {
    if (booking.status === 'requested' && owner) {
      actions.accept = 'Accept rental request'
      actions.decline = 'Decline request'
    }
    if (['requested', 'awaiting_agreement', 'awaiting_payment', 'confirmed', 'active', 'return_proposed'].includes(booking.status)) {
      actions.cancel = 'Request cancellation'
    }
    if (booking.status === 'confirmed' && !booking.activity.some((e: any) => e.actor_id === user.id && e.action === 'pickup')) {
      actions.pickup = 'Acknowledge pickup'
    }
    if (booking.status === 'active' && !owner) actions.return = 'Propose return'
    if (booking.status === 'return_proposed' && owner) actions.receive = 'Confirm receipt & return'
    if (['confirmed', 'active', 'return_proposed'].includes(booking.status)) actions.issue = 'Report handover issue'
  }

  async function act(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const values = new FormData(form)
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement
    const action = submitter.value
    setError('')
    setBusy(true)
    try {
      const files = values.getAll('files').filter((x): x is File => x instanceof File && x.size > 0)
      const b = await api('/rentals/bookings/' + bookingId + '/actions', 'POST', {
        action,
        note: values.get('note') || '',
        accessories: values.get('accessories') || '',
        photos: await upload(files, bookingId)
      })
      setBooking(b)
      form.reset()
      setRevision((n) => n + 1)
      onChange()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1rem' }}>
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'grid',
            placeItems: 'center'
          }}
        >
          <Icons.Wrench size={20} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.1rem' }}>Rental activity & Handover</h3>
          <small>
            {booking.terms.days} billable days · {booking.terms.start_date} to {booking.terms.return_date} · {money(booking.amount)}
          </small>
        </div>
      </div>

      {booking.upcoming && (
        <div
          style={{
            padding: '0.65rem 0.95rem',
            backgroundColor: 'var(--info-surface)',
            border: '1px solid var(--info-border)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.88rem',
            color: 'var(--info)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem'
          }}
        >
          <Icons.Clock size={16} />
          <span>Upcoming pickup: verify condition with photos at handover.</span>
        </div>
      )}

      {booking.overdue && (
        <div
          style={{
            padding: '0.65rem 0.95rem',
            backgroundColor: 'var(--error-surface)',
            border: '1px solid var(--error-border)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.88rem',
            color: 'var(--error)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem'
          }}
        >
          <Icons.AlertTriangle size={16} />
          <span>Return overdue: please coordinate return with the owner.</span>
        </div>
      )}

      {Object.keys(actions).length > 0 && (
        <form onSubmit={act} style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
          <label>
            <span>Condition notes or action reason</span>
            <textarea
              name="note"
              maxLength={2000}
              placeholder="e.g. Item collected in clean condition, tested and working"
            />
          </label>

          <label>
            <span>Accessories checked</span>
            <input
              name="accessories"
              maxLength={1000}
              placeholder="e.g. Case, 2 batteries, charger verified"
            />
          </label>

          <label>
            <span>Private condition photos (evidence)</span>
            <input type="file" name="files" multiple accept="image/jpeg,image/png,image/webp" />
          </label>

          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            {Object.entries(actions).map(([action, label]) => (
              <button
                key={action}
                value={action}
                disabled={busy}
                className={action === 'cancel' || action === 'decline' ? 'btn-danger' : ''}
              >
                <span>{busy ? 'Processing…' : label}</span>
              </button>
            ))}
          </div>
        </form>
      )}

      {error && <p role="alert">{error}</p>}

      {/* Activity Timeline */}
      <h4 style={{ fontSize: '1rem', marginTop: '1.5rem', marginBottom: '0.75rem' }}>Handover history</h4>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {booking.activity.map((entry: any) => (
          <div
            key={entry.id}
            style={{
              padding: '0.85rem 1.15rem',
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.9rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="badge badge-primary">{entry.action}</span>
                <span style={{ fontWeight: 600 }}>
                  {entry.actor_id === user.id
                    ? 'You'
                    : entry.actor_id === booking.provider_id
                    ? 'Owner'
                    : 'Renter'}
                </span>
              </div>
              <small>{timeIST(entry.created_at)}</small>
            </div>

            {entry.note && <p style={{ marginTop: '0.4rem', color: 'var(--text-main)' }}>{entry.note}</p>}
            {entry.accessories && (
              <small style={{ display: 'block', color: 'var(--text-muted)' }}>
                Accessories: {entry.accessories}
              </small>
            )}

            {entry.photos.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                {entry.photos.map((id: number) => (
                  <a
                    key={id}
                    href={'/api/uploads/' + id}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.8rem',
                      padding: '0.25rem 0.5rem',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)'
                    }}
                  >
                    <Icons.Camera size={12} />
                    <span>Photo #{id}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
