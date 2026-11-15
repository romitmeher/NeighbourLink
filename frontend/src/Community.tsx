import { FormEvent, ReactNode, useEffect, useState } from 'react'
import { api, money, timeIST } from './api'
import { Icons } from './Icons'

type User = { id: number; name: string; is_admin: boolean }
type Props = { user: User; bookingId?: number; openBooking?: (id: number) => void }
type EventRecord = { id: number; sender: string; body: string; created_at: string; read_at: string | null }

function useData(path: string, revision: number, interval = 0) {
  const [value, setValue] = useState<any>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    let timer: ReturnType<typeof setTimeout>
    setValue(null)
    setError('')
    async function refresh() {
      try {
        const result = await api(path)
        if (current) {
          setValue(result)
          setError('')
        }
      } catch (e) {
        if (current) setError((e as Error).message)
      }
      if (current && interval) timer = setTimeout(refresh, interval)
    }
    void refresh()
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [path, revision, interval])
  return { value, error }
}

function Form({
  submit,
  children,
  label,
  icon
}: {
  submit: (data: FormData) => Promise<void>
  children: ReactNode
  label: string
  icon?: ReactNode
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const form = e.currentTarget
    setBusy(true)
    setError('')
    try {
      await submit(new FormData(form))
      form.reset()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={handle} style={{ display: 'grid', gap: '0.85rem' }}>
      {children}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy} className="btn-lg" style={{ width: 'fit-content' }}>
        {icon}
        <span>{busy ? 'Saving…' : label}</span>
      </button>
    </form>
  )
}

function Messages({ path, readOnly = false }: { path: string; readOnly?: boolean }) {
  const [revision, refresh] = useState(0)
  const { value, error } = useData(path, revision, 6000)
  const [readError, setReadError] = useState('')

  useEffect(() => {
    if (!readOnly && value?.some((m: EventRecord) => !m.read_at)) {
      let alive = true
      api(path + '/read', 'POST').catch((e) => {
        if (alive) setReadError(e.message)
      })
      return () => {
        alive = false
      }
    }
    return undefined
  }, [path, value, readOnly])

  return (
    <section className="panel" style={{ marginTop: '1rem' }}>
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
          <Icons.MessageSquare size={20} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.1rem' }}>Messages & notes</h3>
          <small>End-to-end recorded communication for this reservation</small>
        </div>
      </div>

      {(error || readError) && <p role="alert">{error || readError}</p>}
      {value === null && !error && <p role="status">Loading messages…</p>}
      {value?.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '1rem 0' }}>
          No messages sent yet. Use this channel to coordinate details, address, or pickup time.
        </p>
      )}

      {/* Message Feed */}
      <div
        className="conversation-thread"
        style={{
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          marginBottom: '1rem',
          minHeight: '180px'
        }}
      >
        {value?.map((m: EventRecord) => (
          <div key={m.id} className="message-bubble incoming">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.2rem' }}>
              <strong style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>{m.sender}</strong>
              <small style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {timeIST(m.created_at)}
              </small>
            </div>
            <p style={{ margin: 0, fontSize: '0.92rem' }}>{m.body}</p>
          </div>
        ))}
      </div>

      {!readOnly && (
        <Form
          label="Send message"
          icon={<Icons.ArrowRight size={16} />}
          submit={async (f) => {
            await api(path, 'POST', { body: f.get('body') })
            refresh((n) => n + 1)
          }}
        >
          <label>
            <span>Your message</span>
            <textarea
              name="body"
              required
              maxLength={4000}
              placeholder="Type your message here..."
              rows={3}
            />
          </label>
        </Form>
      )}
    </section>
  )
}

export function RequestMessages({
  requestId,
  providerId
}: {
  requestId: number
  providerId: number
}) {
  return (
    <Messages path={'/community/requests/' + requestId + '/providers/' + providerId + '/messages'} />
  )
}

function Cases({
  items,
  user,
  refresh
}: {
  items: any[]
  user: User
  refresh: () => void
}) {
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {items.map((r) => (
        <article
          key={r.id}
          style={{
            backgroundColor: '#FAFCFA',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.2rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-error">Report #{r.id}</span>
              <strong style={{ fontSize: '1.05rem' }}>{r.reason}</strong>
            </div>
            <span className="badge badge-neutral">{r.status}</span>
          </div>

          <p style={{ margin: '0.5rem 0', color: 'var(--text-main)' }}>{r.description}</p>
          <small style={{ color: 'var(--text-muted)' }}>Associated Booking #{r.booking_id}</small>

          {r.evidence?.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              {r.evidence.map((id: number) => (
                <a
                  key={id}
                  href={'/api/uploads/' + id}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary btn-sm"
                >
                  <Icons.Camera size={12} />
                  <span>Evidence #{id}</span>
                </a>
              ))}
            </div>
          )}

          {r.history?.length > 0 && (
            <div
              style={{
                marginTop: '1rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid #EEF3EF',
                display: 'grid',
                gap: '0.5rem'
              }}
            >
              <small style={{ fontWeight: 700, color: 'var(--text-muted)' }}>Case history:</small>
              {r.history.map((h: any) => (
                <div key={h.id} style={{ fontSize: '0.85rem' }}>
                  <small style={{ color: 'var(--text-muted)' }}>
                    {timeIST(h.created_at)} · User #{h.actor_id} · {h.action}
                  </small>
                  <p style={{ margin: '0.15rem 0' }}>{h.text}</p>
                </div>
              ))}
            </div>
          )}

          {(user.is_admin || (user.id !== r.author_id && r.status !== 'resolved')) && (
            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #EEF3EF' }}>
              <Form
                label="Add case update"
                submit={async (f) => {
                  await api('/community/reports/' + r.id + '/actions', 'POST', {
                    action: f.get('action'),
                    text: f.get('text')
                  })
                  refresh()
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                  <label>
                    <span>Action</span>
                    <select name="action">
                      {user.is_admin ? (
                        <>
                          <option value="note">Private admin note</option>
                          {r.status === 'open' && <option value="investigating">Investigating</option>}
                          {r.status === 'resolved' ? (
                            <option value="reopened">Reopen</option>
                          ) : (
                            <option value="resolved">Resolve</option>
                          )}
                        </>
                      ) : (
                        <option value="response">Participant response</option>
                      )}
                    </select>
                  </label>
                  <label>
                    <span>Details</span>
                    <input name="text" required maxLength={4000} placeholder="Notes or response" />
                  </label>
                </div>
              </Form>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}

function BookingCommunity({ user, bookingId }: { user: User; bookingId: number }) {
  const [revision, setRevision] = useState(0)
  const reload = () => setRevision((n) => n + 1)
  const path = '/community/bookings/' + bookingId
  const { value, error } = useData(path + '/activity', revision)

  if (error) return <p role="alert">{error}</p>
  if (!value) return <p role="status">Loading booking community details…</p>

  return (
    <>
      <Messages path={path + '/messages'} readOnly={!value.participant} />

      <section className="panel" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1rem' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--warning-surface)',
              color: 'var(--warning)',
              display: 'grid',
              placeItems: 'center'
            }}
          >
            <Icons.AlertTriangle size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.1rem' }}>Dispute reports & resolutions</h3>
            <small>Formal review cases for this booking</small>
          </div>
        </div>

        <Cases items={value.reports} user={user} refresh={reload} />

        {value.participant && (
          <details style={{ marginTop: '1rem' }}>
            <summary style={{ color: 'var(--primary)', fontFamily: 'var(--font-heading)' }}>
              Open a dispute report for this booking
            </summary>
            <div style={{ marginTop: '0.75rem' }}>
              <Form
                label="Submit formal report"
                icon={<Icons.AlertTriangle size={16} />}
                submit={async (f) => {
                  const evidence: number[] = []
                  for (const file of f.getAll('photos')) {
                    if (!(file instanceof File) || !file.size) continue
                    const form = new FormData()
                    form.set('file', file)
                    form.set('booking_id', String(bookingId))
                    evidence.push((await api('/uploads', 'POST', form)).id)
                  }
                  await api(path + '/reports', 'POST', {
                    reason: f.get('reason'),
                    description: f.get('description'),
                    evidence
                  })
                  reload()
                }}
              >
                <label>
                  <span>Reason</span>
                  <input name="reason" required maxLength={120} placeholder="e.g. Item damaged on return" />
                </label>
                <label>
                  <span>What happened?</span>
                  <textarea
                    name="description"
                    required
                    maxLength={4000}
                    placeholder="Provide specific details of the incident"
                  />
                </label>
                <label>
                  <span>Photos / Evidence</span>
                  <input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple />
                </label>
              </Form>
            </div>
          </details>
        )}
      </section>

      {/* Reviews */}
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
            <Icons.Star size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.1rem' }}>Booking reviews</h3>
            <small>Peer ratings and experience comments</small>
          </div>
        </div>

        {value.reviews.map((r: any) => (
          <div
            key={r.id}
            style={{
              padding: '0.85rem 1.15rem',
              backgroundColor: '#FAFCFA',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '0.65rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#D97706' }}>
              {[...Array(r.stars)].map((_, i) => (
                <Icons.Star key={i} size={16} />
              ))}
              <strong style={{ marginLeft: '0.35rem', color: 'var(--text-main)' }}>{r.stars} / 5</strong>
            </div>
            {r.comment && <p style={{ marginTop: '0.35rem' }}>{r.comment}</p>}
          </div>
        ))}

        {value.participant &&
        value.status === 'completed' &&
        !value.reviews.some((r: any) => r.reviewer_id === user.id) ? (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Leave a review</h4>
            <Form
              label="Submit review"
              icon={<Icons.Star size={16} />}
              submit={async (f) => {
                await api(path + '/reviews', 'POST', {
                  stars: Number(f.get('stars')),
                  comment: f.get('comment')
                })
                reload()
              }}
            >
              <label>
                <span>Rating</span>
                <select name="stars">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} Stars
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Comment</span>
                <textarea name="comment" maxLength={2000} placeholder="Share your experience..." />
              </label>
            </Form>
          </div>
        ) : (
          value.reviews.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              Reviews open once the booking reaches completed status.
            </p>
          )
        )}
      </section>
    </>
  )
}

function Finance({ data }: { data: any }) {
  return (
    <div className="metric-grid">
      {[
        ['Total Booking Value', money(data.booking_value)],
        ['Captured Payments', money(data.captured)],
        ['Verified Refunds', money(data.refunded)],
        ['Platform Commission (10%)', money(data.commission)],
        ['Provider Net Earnings', money(data.earnings)],
        ['Payout Status', data.payout_status]
      ].map(([label, val]) => (
        <div key={label} className="metric-card">
          <span className="metric-label">{label}</span>
          <strong className="metric-value" style={{ fontSize: '1.45rem' }}>
            {val}
          </strong>
        </div>
      ))}
    </div>
  )
}

function Admin({ user, openBooking }: Props) {
  const [revision, setRevision] = useState(0)
  const reload = () => setRevision((n) => n + 1)
  const { value, error } = useData('/community/admin/dashboard', revision)

  if (error) return <p role="alert">{error}</p>
  if (!value) return <p role="status">Loading admin workspace…</p>

  return (
    <div style={{ marginTop: '2.5rem' }}>
      <div className="page-header">
        <div className="page-header-title">
          <small>PLATFORM OPERATOR</small>
          <h2>Platform administration</h2>
        </div>
      </div>

      {/* Counts Grid */}
      <div className="metric-grid">
        {Object.entries(value.counts).map(([k, n]) => (
          <div key={k} className="metric-card">
            <span className="metric-label">{k.replace('_', ' ').toUpperCase()}</span>
            <strong className="metric-value">{String(n)}</strong>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: '1.25rem', marginTop: '1.5rem' }}>
        <details className="panel">
          <summary>
            <strong>Reports & moderation cases ({value.reports.length})</strong>
          </summary>
          <div style={{ marginTop: '1rem' }}>
            <Cases items={value.reports} user={user} refresh={reload} />
          </div>
        </details>

        <details className="panel">
          <summary>
            <strong>User accounts ({value.accounts.length})</strong>
          </summary>
          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
            {value.accounts.map((a: any) => (
              <div
                key={a.id}
                style={{
                  padding: '0.85rem 1.15rem',
                  backgroundColor: '#FAFCFA',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}
              >
                <div>
                  <strong style={{ fontSize: '1rem' }}>{a.name}</strong>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {a.email} · Status: <span className="badge badge-primary">{a.state}</span>
                  </p>
                </div>

                {a.id !== user.id && !a.is_admin && (
                  <Form
                    label="Update status"
                    submit={async (f) => {
                      await api('/admin/users/' + a.id + '/state', 'POST', {
                        state: f.get('state'),
                        reason: f.get('reason')
                      })
                      reload()
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <select name="state" defaultValue={a.state}>
                        {['active', 'restricted', 'suspended'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <input name="reason" required maxLength={600} placeholder="Moderation reason" />
                    </div>
                  </Form>
                )}
              </div>
            ))}
          </div>
        </details>

        <details className="panel">
          <summary>
            <strong>Rental listings ({value.listings.length})</strong>
          </summary>
          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
            {value.listings.map((l: any) => (
              <div
                key={l.id}
                style={{
                  padding: '0.85rem 1.15rem',
                  backgroundColor: '#FAFCFA',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <strong>{l.title}</strong>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {l.category} · Status: {l.status} · Owner #{l.owner_id}
                  </p>
                </div>

                {l.status !== 'archived' && (
                  <Form
                    label={l.status === 'restricted' ? 'Lift restriction' : 'Restrict listing'}
                    submit={async (f) => {
                      await api('/community/admin/listings/' + l.id + '/restriction', 'POST', {
                        restricted: l.status !== 'restricted',
                        reason: f.get('reason')
                      })
                      reload()
                    }}
                  >
                    <input name="reason" required placeholder="Reason for action" />
                  </Form>
                )}
              </div>
            ))}
          </div>
        </details>

        <details className="panel">
          <summary>
            <strong>Marketplace categories</strong>
          </summary>
          <div style={{ marginTop: '1rem' }}>
            <p>
              <strong>Rentals:</strong> {value.categories.rental.join(', ')}
            </p>
            <p style={{ marginTop: '0.35rem' }}>
              <strong>Local Help:</strong> {value.categories.service.join(', ')}
            </p>

            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <Form
                label="Save category"
                submit={async (f) => {
                  await api('/community/admin/categories', 'POST', {
                    name: f.get('name'),
                    kind: f.get('kind'),
                    reason: f.get('reason'),
                    enabled: f.get('mode') === 'enabled'
                  })
                  reload()
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
                  <label>
                    <span>Marketplace</span>
                    <select name="kind">
                      <option value="rental">Rentals</option>
                      <option value="service">Local Help</option>
                    </select>
                  </label>
                  <label>
                    <span>Category name</span>
                    <input name="name" required maxLength={80} />
                  </label>
                  <label>
                    <span>Visibility</span>
                    <select name="mode">
                      <option value="enabled">Enabled</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </label>
                  <label>
                    <span>Audit reason</span>
                    <input name="reason" required placeholder="Reason for update" />
                  </label>
                </div>
              </Form>
            </div>
          </div>
        </details>

        <details className="panel">
          <summary>
            <strong>Financial summary & Payment exceptions</strong>
          </summary>
          <div style={{ marginTop: '1rem' }}>
            <Finance data={value.finances} />
            <h4 style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>Payment exceptions:</h4>
            {value.exceptions.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No payment or refund exceptions recorded.</p>
            ) : (
              value.exceptions.map((e: any, i: number) => (
                <div
                  key={i}
                  style={{
                    padding: '0.65rem 0.95rem',
                    backgroundColor: 'var(--warning-surface)',
                    border: '1px solid var(--warning-border)',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: '0.45rem'
                  }}
                >
                  Booking #{e.booking_id} · {e.reason} · Status: {e.status}
                </div>
              ))
            )}
          </div>
        </details>
      </div>
    </div>
  )
}

function MyDashboard({ user, openBooking }: Props) {
  const [revision, setRevision] = useState(0)
  const reload = () => setRevision((n) => n + 1)
  const dashboard = useData('/community/dashboard', revision)
  const inbox = useData('/community/inbox', revision, 10000)
  const [error, setError] = useState('')

  return (
    <div>
      <div className="page-header">
        <div className="page-header-title">
          <small>COMMUNITY HUB</small>
          <h2>User dashboard</h2>
        </div>
      </div>

      {(error || dashboard.error || inbox.error) && (
        <p role="alert">{error || dashboard.error || inbox.error}</p>
      )}

      {/* Metrics Row */}
      {dashboard.value && (
        <div className="metric-grid">
          <div className="metric-card">
            <span className="metric-label">ACTIVE BOOKINGS</span>
            <strong className="metric-value">
              {
                dashboard.value.bookings.filter(
                  (b: any) => !['completed', 'cancelled', 'declined', 'expired'].includes(b.status)
                ).length
              }
            </strong>
          </div>

          <div className="metric-card">
            <span className="metric-label">UNREAD NOTIFICATIONS</span>
            <strong className="metric-value">
              {inbox.value?.unread_notifications || 0}
            </strong>
          </div>

          <div className="metric-card">
            <span className="metric-label">UNREAD MESSAGES</span>
            <strong className="metric-value">{inbox.value?.unread_messages || 0}</strong>
          </div>

          <div className="metric-card">
            <span className="metric-label">PROVIDER EARNINGS (UNSETTLED)</span>
            <strong className="metric-value" style={{ color: 'var(--primary)' }}>
              {money(dashboard.value.finances.earnings)}
            </strong>
          </div>
        </div>
      )}

      {/* Notifications Section */}
      {inbox.value && (
        <section className="panel" style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
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
                <Icons.Bell size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '0.1rem' }}>
                  Notifications ({inbox.value.unread_notifications} unread)
                </h3>
                <small>{inbox.value.unread_messages} unread booking messages</small>
              </div>
            </div>
          </div>

          {!inbox.value.notifications.length && (
            <p style={{ color: 'var(--text-muted)' }}>No notifications yet.</p>
          )}

          <div style={{ display: 'grid', gap: '0.65rem' }}>
            {inbox.value.notifications.map((n: any) => (
              <div
                key={n.id}
                style={{
                  padding: '0.85rem 1.15rem',
                  backgroundColor: n.read_at ? '#FFFFFF' : 'var(--primary-light)',
                  border: `1px solid ${n.read_at ? 'var(--border)' : 'var(--success-border)'}`,
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: n.read_at ? 400 : 600 }}>{n.message}</p>
                  <small style={{ color: 'var(--text-muted)' }}>{timeIST(n.created_at)}</small>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {openBooking && n.booking_id && (
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => openBooking(n.booking_id)}
                    >
                      <span>Open</span>
                      <Icons.ArrowRight size={12} />
                    </button>
                  )}
                  {!n.read_at && (
                    <button
                      className="btn-subtle btn-sm"
                      onClick={async () => {
                        try {
                          await api('/community/notifications/' + n.id + '/read', 'POST')
                          reload()
                        } catch (e) {
                          setError((e as Error).message)
                        }
                      }}
                    >
                      <Icons.Check size={14} />
                      <span>Mark read</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bookings & Earnings Overview */}
      {dashboard.value && (
        <>
          <section className="panel" style={{ marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Financial ledger breakdown</h3>
            <Finance data={dashboard.value.finances} />
          </section>

          {dashboard.value.reports.length > 0 && (
            <section className="panel" style={{ marginTop: '1.5rem' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>My incident reports</h3>
              <Cases items={dashboard.value.reports} user={user} refresh={reload} />
            </section>
          )}
        </>
      )}
    </div>
  )
}

export default function Community(props: Props) {
  if (props.bookingId !== undefined) {
    return <BookingCommunity user={props.user} bookingId={props.bookingId} />
  }
  return (
    <>
      <MyDashboard {...props} />
      {props.user.is_admin && <Admin {...props} />}
    </>
  )
}
