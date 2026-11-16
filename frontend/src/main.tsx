import React, { FormEvent, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { api, ApiError, money, timeIST } from './api'
import Rental, { RentalActions } from './Rental'
import Services, { ServiceActions } from './Services'
import Payments from './Payments'
import Community from './Community'
import Home from './Home'
import Landing from './Landing'
import { Icons } from './Icons'
import { rentalPhoto } from './rentalPhoto'
import CommunityFaces from './CommunityFaces'
import './style.css'

function Brand({ onClick }: { onClick?: () => void }) {
  const mark = <>
    <svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true">
      <circle cx="22" cy="14" r="10" fill="#ffd23f" />
      <rect x="2" y="9" width="19" height="21" rx="7" fill="var(--primary)" />
      <circle cx="11.5" cy="19.5" r="3" fill="#fff" />
    </svg>
    <span>neighbour<span className="brand-accent">link</span></span>
  </>
  return onClick ? (
    <button type="button" className="brand-link" onClick={onClick}>{mark}</button>
  ) : <div className="brand-link">{mark}</div>
}

function Auth({ onUser, onBack, initialJoin = false }: { onUser: (u: any) => void; onBack: () => void; initialJoin?: boolean }) {
  const [join, setJoin] = useState(initialJoin)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [otpPhone, setOtpPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpMessage, setOtpMessage] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const values = Object.fromEntries(new FormData(e.currentTarget))
    try {
      await api(join ? '/auth/register' : '/auth/login', 'POST', values)
      onUser(await api('/auth/me'))
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setBusy(false)
    }

  }

  async function requestOtp() {
    setError('')
    try {
      const result = await api('/auth/dev-otp/request', 'POST', { phone: otpPhone })
      setOtpSent(true)
      setOtpMessage('Development code: ' + result.development_code)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function verifyOtp() {
    setError('')
    try {
      onUser(await api('/auth/dev-otp/verify', 'POST', { phone: otpPhone, code: otpCode }))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <main className="auth-split-view">
      <section className="auth-hero-pane">
        <div>
          <Brand />
          <div style={{ marginTop: '5rem', maxWidth: '480px' }}>
            <span
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '0.8rem',
                fontWeight: 750,
                letterSpacing: '0.12em',
                color: '#ffd23f',
                textTransform: 'uppercase'
              }}
            >
              PHYSICAL NEIGHBOURHOOD MARKETPLACE
            </span>
            <h1
              style={{
                color: '#FFFFFF',
                marginTop: '0.75rem',
                marginBottom: '1.25rem',
                lineHeight: 1.15
              }}
            >
              Borrow nearby. <br />
              <em style={{ color: '#ffd23f', fontStyle: 'normal' }}>Find local help.</em>
            </h1>
            <p style={{ color: '#e3dbff', fontSize: '1.15rem', lineHeight: 1.6 }}>
              Rent everyday items, hire trusted neighbours for tasks, and keep all agreements and
              handover notes in one place.
            </p>
          </div>
        </div>

        <div style={{ fontSize: '0.82rem', color: 'var(--border)' }}>
          <span>© 2026 NeighbourLink · India Standard Time · Secure demo payments</span>
        </div>
      </section>

      <section className="auth-form-pane">
        <div className="auth-card-box">
          <button type="button" className="auth-back-link" onClick={onBack}>← Back to home</button>
          <div
            className="segmented-tabs"
            style={{ width: '100%', marginBottom: '1.75rem', justifyContent: 'center' }}
          >
            <button
              type="button"
              className={`segmented-tab ${!join ? 'active' : ''}`}
              aria-pressed={!join}
              onClick={() => {
                setJoin(false)
                setError('')
              }}
              style={{ flex: 1 }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`segmented-tab ${join ? 'active' : ''}`}
              aria-pressed={join}
              onClick={() => {
                setJoin(true)
                setError('')
              }}
              style={{ flex: 1 }}
            >
              Create account
            </button>
          </div>

          <h2 style={{ fontSize: '1.6rem', marginBottom: '0.4rem' }}>
            {join ? 'Join your neighbourhood' : 'Welcome back'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            {join
              ? 'Create a free account to borrow items, list equipment, or offer local help.'
              : 'Sign in to access your bookings, messages, and listings.'}
          </p>

          <form key={String(join)} onSubmit={submit} style={{ display: 'grid', gap: '1.1rem' }}>
            {join && (
              <>
                <label>
                  <span>Your full name</span>
                  <input
                    name="name"
                    autoComplete="name"
                    placeholder="e.g. Priya Sharma"
                    required
                    maxLength={100}
                  />
                </label>
                <label>
                  <span>Approximate area</span>
                  <input
                    name="area"
                    placeholder="e.g. Dadar, Mumbai"
                    required
                    maxLength={120}
                  />
                </label>
                <label>
                  <span>Indian mobile number (optional)</span>
                  <input name="phone" placeholder="+91 98765 43210" inputMode="tel" maxLength={16} />
                </label>
              </>
            )}

            <label>
              <span>Email address</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                required
              />
            </label>

            <label>
              <span>Password</span>
              <input
                name="password"
                type="password"
                autoComplete={join ? 'new-password' : 'current-password'}
                minLength={join ? 10 : 1}
                required
              />
              {join && <small>Use at least 10 characters for security.</small>}
            </label>

            {error && <p role="alert">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="btn-lg"
              style={{ marginTop: '0.5rem', width: '100%' }}
            >
              <span>{busy ? 'Please wait…' : join ? 'Create account' : 'Sign in'}</span>
              <Icons.ArrowRight size={18} />
            </button>
          </form>
          <div className="dev-otp-panel">
            <small>Development testing only</small>
            <h3>Sign in with phone OTP</h3>
            <p>Available only while the server runs in development mode.</p>
            <div className="otp-actions">
              <input value={otpPhone} onChange={e => setOtpPhone(e.target.value)} placeholder="+91 mobile number" inputMode="tel" aria-label="Indian mobile number" />
              {!otpSent
                ? <button type="button" onClick={requestOtp}>Send code</button>
                : <button type="button" onClick={verifyOtp}>Verify code</button>}
            </div>
            {otpSent && <input value={otpCode} onChange={e => setOtpCode(e.target.value)} placeholder="6-digit code" inputMode="numeric" maxLength={6} aria-label="One-time password" />}
            {otpMessage && <p role="status">{otpMessage}</p>}
          </div>
        </div>
      </section>
    </main>
  )
}

function Terms({ value }: { value: any }) {
  return (
    <dl style={{ display: 'grid', gap: '0.75rem', margin: '1rem 0' }}>
      {Object.entries(value).map(([k, v]) => (
        <div
          key={k}
          style={{
            padding: '0.65rem 0',
            borderBottom: '1px solid var(--border)'
          }}
        >
          <dt
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: '0.85rem',
              color: 'var(--primary)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '0.2rem'
            }}
          >
            {k.replaceAll('_', ' ')}
          </dt>
          <dd style={{ marginLeft: 0, color: 'var(--text-main)', fontSize: '0.92rem' }}>
            {v && typeof v === 'object' && !Array.isArray(v) ? (
              <Terms value={v} />
            ) : Array.isArray(v) ? (
              v.join(', ')
            ) : (
              String(v ?? '—')
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Agreement({ b, user, refresh }: { b: any; user: any; refresh: () => void }) {
  const [a, setA] = useState<any>(null)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () =>
    api('/bookings/' + b.id + '/agreement')
      .then(setA)
      .catch((e) => setError(e.message))

  useEffect(() => {
    setA(null)
    setChecked(false)
    setError('')
    load()
  }, [b.id, b.status])

  async function sign() {
    setBusy(true)
    setError('')
    try {
      await api('/bookings/' + b.id + '/agreement/accept', 'POST', {
        version: a.version,
        digest: a.digest,
        accept: checked
      })
      await load()
      refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const isParticipant = [b.customer_id, b.provider_id].includes(user.id)
  const userSigned = a?.acceptances?.some((x: any) => x.user_id === user.id)

  return (
    <section className="panel" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <Icons.FileText size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.1rem' }}>
              {b.kind === 'rental' ? 'Rental Agreement' : 'Scope of Work Agreement'}
            </h3>
            <small>Immutable, participant-signed document</small>
          </div>
        </div>

        {a && (
          <a
            href={`/api/bookings/${b.id}/agreement.pdf`}
            download
            className="btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Icons.Download size={14} />
            <span>Download PDF</span>
          </a>
        )}
      </div>

      {error && <p role="alert">{error}</p>}

      {a && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              margin: '1rem 0',
              padding: '0.75rem 1rem',
              backgroundColor: a.acceptances.length === 2 ? 'var(--success-surface)' : 'var(--warning-surface)',
              border: `1px solid ${a.acceptances.length === 2 ? 'var(--success-border)' : 'var(--warning-border)'}`,
              borderRadius: 'var(--radius-md)',
              fontSize: '0.88rem'
            }}
          >
            {a.acceptances.length === 2 ? (
              <Icons.CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
            ) : (
              <Icons.Clock size={18} style={{ color: 'var(--warning)' }} />
            )}
            <span>
              <strong>{a.acceptances.length} of 2 parties accepted</strong> · Version {a.version} · SHA-256:{' '}
              <code>{a.digest.slice(0, 10)}…</code>
            </span>
          </div>

          <details className="agreement-container">
            <summary style={{ fontFamily: 'var(--font-heading)', color: 'var(--primary)' }}>
              Read full agreement terms (v{a.version})
            </summary>
            <Terms value={a.document} />
          </details>

          {isParticipant && !userSigned && b.status === 'awaiting_agreement' && (
            <div
              style={{
                marginTop: '1.25rem',
                padding: '1.25rem',
                backgroundColor: '#FFFFFF',
                border: '1.5px solid var(--primary)',
                borderRadius: 'var(--radius-md)',
                display: 'grid',
                gap: '0.85rem'
              }}
            >
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                />
                <span>
                  I have read and agree to the terms in version {a.version} of this agreement.
                </span>
              </label>
              <button
                disabled={!checked || busy}
                onClick={sign}
                className="btn-lg"
                style={{ width: 'fit-content' }}
              >
                <Icons.Check size={16} />
                <span>{busy ? 'Signing…' : `Accept agreement (version ${a.version})`}</span>
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function Booking({ id, user, onBack }: { id: number; user: any; onBack: () => void }) {
  const [b, setB] = useState<any>(null)
  const [error, setError] = useState('')

  const reload = () =>
    api('/bookings/' + id)
      .then((v) => {
        setB(v)
        setError('')
      })
      .catch((e) => setError(e.message))

  useEffect(() => {
    setB(null)
    reload()
  }, [id])

  // Compute step tracker state
  let currentStep = 1
  if (b) {
    if (['awaiting_agreement'].includes(b.status)) currentStep = 2
    else if (['awaiting_payment'].includes(b.status)) currentStep = 3
    else if (['confirmed', 'active', 'return_proposed', 'in_progress', 'completion_proposed', 'completed'].includes(b.status))
      currentStep = 4
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="btn-subtle btn-sm"
        style={{ marginBottom: '1.2rem', padding: '0.4rem 0.6rem' }}
      >
        <Icons.ChevronLeft size={16} />
        <span>Back to my bookings</span>
      </button>

      {error && (
        <p role="alert">
          {error} <button onClick={reload}>Retry</button>
        </p>
      )}

      {b && (
        <>
          {/* Header Card */}
          <div
            className="panel"
            style={{
              borderLeft: '5px solid var(--primary)',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span className="badge badge-primary">
                  {b.kind.toUpperCase()} #{b.id}
                </span>
                <span className="badge badge-neutral">
                  {b.status.replaceAll('_', ' ')}
                </span>
              </div>
              <h1 style={{ fontSize: '1.8rem', marginTop: '0.4rem', marginBottom: '0.2rem' }}>
                {b.terms?.title || b.terms?.task_title || b.terms?.scope || 'Booking Workspace'}
              </h1>
              <small style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Icons.Clock size={14} />
                <span>{timeIST(b.start_at)}</span>
              </small>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '2rem',
                  fontWeight: 800,
                  color: 'var(--primary)',
                  display: 'block'
                }}
              >
                {money(b.amount)}
              </span>
              <small style={{ color: 'var(--text-muted)' }}>
                {b.terms?.days ? `${b.terms.days} billable days` : 'Agreed quote'}
              </small>
            </div>
          </div>

          {/* Visual Step Tracker */}
          <div className="step-tracker">
            <div className={`step-item ${currentStep >= 1 ? 'completed' : ''} ${currentStep === 1 ? 'active' : ''}`}>
              <div className="step-circle">{currentStep > 1 ? <Icons.Check size={16} /> : '1'}</div>
              <span className="step-label">1. Request</span>
            </div>
            <div className={`step-item ${currentStep >= 2 ? (currentStep > 2 ? 'completed' : 'active') : ''}`}>
              <div className="step-circle">{currentStep > 2 ? <Icons.Check size={16} /> : '2'}</div>
              <span className="step-label">2. Agreement</span>
            </div>
            <div className={`step-item ${currentStep >= 3 ? (currentStep > 3 ? 'completed' : 'active') : ''}`}>
              <div className="step-circle">{currentStep > 3 ? <Icons.Check size={16} /> : '3'}</div>
              <span className="step-label">3. Payment</span>
            </div>
            <div className={`step-item ${currentStep >= 4 ? 'active' : ''}`}>
              <div className="step-circle">{b.status === 'completed' ? <Icons.Check size={16} /> : '4'}</div>
              <span className="step-label">4. Handover & Done</span>
            </div>
          </div>

          {/* Activity Actions according to kind */}
          {b.kind === 'rental' ? (
            <RentalActions bookingId={id} user={user} onChange={reload} />
          ) : (
            <ServiceActions booking={b} user={user} reload={reload} />
          )}

          {/* Agreement panel */}
          {!['requested', 'declined', 'rejected'].includes(b.status) && (
            <Agreement b={b} user={user} refresh={reload} />
          )}

          {/* Payment panel */}
          <Payments booking={b} user={user} refresh={reload} />

          {/* Community & Messaging */}
          <Community bookingId={id} user={user} />
        </>
      )}
    </div>
  )
}

function BookingList({ open }: { open: (n: number) => void }) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/bookings')
      .then(setRows)
      .catch((e) => setError(e.message))
  }, [])

  return (
    <div>
      <div className="page-header">
        <div className="page-header-title">
          <small>YOUR ACTIVITY</small>
          <h2>My bookings</h2>
        </div>
      </div>

      {error && <p role="alert">{error}</p>}
      {rows === null && !error && <p role="status">Loading bookings…</p>}

      {rows?.length === 0 && (
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
            <Icons.Calendar size={28} />
          </div>
          <h3 style={{ marginBottom: '0.4rem' }}>No bookings yet</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
            When you request a rental item or accept a local help offer, your booking workspace will appear here.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: '0.85rem' }}>
        {rows?.map((b) => (
          <div
            key={b.id}
            className="booking-item-row"
            onClick={() => open(b.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') open(b.id)
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
                  <span className="badge badge-neutral">{b.status.replaceAll('_', ' ')}</span>
                </div>
                <strong style={{ fontSize: '1.05rem', display: 'block', marginTop: '0.25rem' }}>
                  {b.terms.title || b.terms.task_title || 'Local Help'}
                </strong>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '1.25rem',
                  fontWeight: 750,
                  color: 'var(--primary)',
                  display: 'block'
                }}
              >
                {money(b.amount)}
              </span>
              <small>{timeIST(b.start_at)}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Profile({ user, onUser }: { user: any; onUser: (u: any) => void }) {
  const [message, setMessage] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const photo = f.get('photo') as File
      const body: any = { name: f.get('name'), area: f.get('area'), phone: f.get('phone') }
      if (photo?.size) {
        const upload = new FormData()
        upload.append('file', photo)
        upload.append('public', 'true')
        body.photo_id = (await api('/uploads', 'POST', upload)).id
      }
      await api('/profile', 'PATCH', body)
      onUser(await api('/auth/me'))
      setMessage('Profile saved successfully.')
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPasswordBusy(true)
    setPasswordMessage('')
    try {
      const form = new FormData(e.currentTarget)
      const updated = await api('/auth/password', 'POST', {
        current_password: form.get('current_password'),
        new_password: form.get('new_password')
      })
      onUser(updated)
      e.currentTarget.reset()
      setPasswordMessage('Password changed successfully.')
    } catch (e) {
      setPasswordMessage((e as Error).message)
    } finally {
      setPasswordBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-header-title">
          <small>ACCOUNT</small>
          <h2>My profile</h2>
        </div>
      </div>

      <div className="panel">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1.2rem',
            paddingBottom: '1.5rem',
            marginBottom: '1.5rem',
            borderBottom: '1px solid var(--border)'
          }}
        >
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary)',
              display: 'grid',
              placeItems: 'center',
              fontSize: '1.8rem',
              fontWeight: 800,
              overflow: 'hidden',
              border: '2px solid var(--border)'
            }}
          >
            {user.photo_id ? (
              <img
                src={'/api/uploads/' + user.photo_id}
                alt="Profile"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              user.name?.[0]?.toUpperCase() || 'U'
            )}
          </div>
          <div>
            <h3 style={{ fontSize: '1.3rem', marginBottom: '0.2rem' }}>{user.name}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{user.email}</p>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
              <span className="badge badge-primary">{user.state}</span>
              {user.is_admin && <span className="badge badge-warning">Admin</span>}
            </div>
          </div>
        </div>

        <form onSubmit={save} style={{ display: 'grid', gap: '1.2rem' }}>
          <label>
            <span>Full name</span>
            <input name="name" defaultValue={user.name} required maxLength={100} />
          </label>
          <label>
            <span>Approximate area</span>
            <input
              name="area"
              defaultValue={user.area}
              placeholder="e.g. Dadar, Mumbai"
              maxLength={120}
            />
          </label>
          <label>
            <span>Contact phone</span>
            <input
              name="phone"
              type="tel"
              defaultValue={user.phone}
              placeholder="+91 98765 43210"
              maxLength={30}
            />
          </label>
          <label>
            <span>Update profile photo</span>
            <input type="file" name="photo" accept="image/png,image/jpeg,image/webp" />
          </label>

          {message && <p role="status">{message}</p>}

          <button type="submit" disabled={busy} className="btn-lg" style={{ width: 'fit-content' }}>
            <span>{busy ? 'Saving…' : 'Save profile'}</span>
          </button>
        </form>
      </div>
      <div className="panel" style={{ marginTop: '1.2rem' }}>
        <h3>Change password</h3>
        <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 1rem' }}>
          Changing your password signs out other active sessions.
        </p>
        <form onSubmit={changePassword} style={{ display: 'grid', gap: '1.2rem' }}>
          <label>
            <span>Current password</span>
            <input name="current_password" type="password" required maxLength={256} />
          </label>
          <label>
            <span>New password</span>
            <input name="new_password" type="password" required minLength={10} maxLength={256} />
          </label>
          {passwordMessage && <p role="status">{passwordMessage}</p>}
          <button type="submit" disabled={passwordBusy} className="btn-lg" style={{ width: 'fit-content' }}>
            <span>{passwordBusy ? 'Updating…' : 'Update password'}</span>
          </button>
        </form>
      </div>
    </div>
  )
}

const TABS = ['Home', 'Rentals', 'Local Help', 'Bookings', 'Dashboard', 'Profile'] as const

function ThemeToggle() {
  const [dark, setDark] = useState(() => localStorage.getItem('neighbourlink-theme') === 'dark')
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('neighbourlink-theme', dark ? 'dark' : 'light')
  }, [dark])
  return (
    <button type="button" className="theme-toggle" aria-label="Dark theme" aria-pressed={dark} onClick={() => setDark(!dark)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19m0-14-1.5 1.5m-11 11L5 19" /></> :
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />}
      </svg>
    </button>
  )
}

const previewItems = [
  { title: 'Folding picnic table', category: 'Household', area: 'Dadar', price: 160, art: 'household' },
  { title: 'Handheld vacuum', category: 'Household', area: 'Dadar', price: 200, art: 'tools' },
  { title: 'Camping chairs, pair', category: 'Camping', area: 'Dadar', price: 150, art: 'camping' },
  { title: 'Portable speaker', category: 'Party & audio', area: 'Dadar', price: 250, art: 'party' }
]

function LocalPreview({ retry }: { retry: () => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [sort, setSort] = useState('default')
  const shown = previewItems
    .filter((item) => (category === 'All' || item.category === category) && item.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'price' ? a.price - b.price : 0)

  return (
    <div className="local-preview">
      <header className="top-nav"><div className="top-nav-inner">
        <Brand />
        <span className="location-pill"><Icons.MapPin size={16} />Dadar, Mumbai</span>
        <span className="preview-label">Local design preview</span>
      </div></header>
      <main className="main-workspace rentals-page">
        <div className="preview-notice" role="status">
          <span>The local backend is unavailable. Browse the design with sample items.</span>
          <button type="button" className="btn-secondary btn-sm" onClick={retry}>Retry connection</button>
        </div>
        <div className="page-header rentals-heading">
          <div className="page-header-title"><h1>Rentals <span className="rental-count">{shown.length} near you</span></h1><p>Borrow equipment from people near you.</p></div>
          <CommunityFaces />
        </div>
        <div className="segmented-tabs" role="group" aria-label="Rental views"><button className="segmented-tab active" type="button">Browse items</button></div>
        <div className="rental-filters">
          <label className="rental-search"><Icons.Search size={18} /><input type="search" aria-label="Search sample items" placeholder="Tent, projector, drill, ladder…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="rental-chips" role="group" aria-label="Category">
            {['All', 'Household', 'Camping', 'Party & audio'].map((name) => <button key={name} type="button" className="rental-chip" aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}
          </div>
          <div className="rental-filter-options"><select aria-label="Sort sample items" value={sort} onChange={(event) => setSort(event.target.value)}><option value="default">Default order</option><option value="price">Lowest price</option></select></div>
        </div>
        {shown.length ? <div className={`listing-grid rental-grid ${shown.length === 4 ? 'rental-bento' : ''}`}>
          {shown.map((item, index) => <article className="listing-card" key={item.title}>
            <div className="rental-card-top"><span className="badge badge-primary">{item.category}</span></div>
            <div className="listing-media rental-media"><img className="rental-photo" src={rentalPhoto(item.title, item.category)} alt="" /></div>
            <div className="listing-body"><h3 className="listing-title">{item.title}</h3><div className="listing-meta rental-meta"><small><Icons.MapPin size={14} />{item.area}</small><span className="listing-price-badge">₹{item.price} <small>/ day</small></span></div><div className="rental-neighbour"><img src={`/community-portraits/neighbour-${index + 1}.png`} alt="" /><span>Demo neighbour</span></div></div>
          </article>)}
        </div> : <div className="empty-state"><h3>Nothing here yet</h3><p>Try another search or category.</p></div>}
      </main>
    </div>
  )
}

function App() {
  const [user, setUser] = useState<any>()
  const [error, setError] = useState('')
  const [showAuth, setShowAuth] = useState<'sign-in' | 'join' | null>(null)
  const [route, setRoute] = useState(decodeURIComponent(location.hash.slice(1)) || 'Home')

  const load = () => {
    setError('')
    api('/auth/me')
      .then(setUser)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) setUser(null)
        else setError(e.message)
      })
  }

  useEffect(() => {
    load()
    const listener = () => setRoute(decodeURIComponent(location.hash.slice(1)) || 'Home')
    window.addEventListener('hashchange', listener)
    return () => window.removeEventListener('hashchange', listener)
  }, [])

  const go = (r: string) => {
    location.hash = encodeURIComponent(r)
  }
  const openBooking = (n: number) => go('booking/' + n)

  if (!user && error) {
    return import.meta.env.DEV ? <LocalPreview retry={load} /> : (
      <main className="connection-error"><div className="panel"><Brand /><p role="alert">{error}</p><button onClick={load}>Retry connection</button></div></main>
    )
  }

  if (user === undefined) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem'
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <Brand />
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Connecting to NeighbourLink…</p>
        </div>
      </main>
    )
  }

  if (user === null) {
    if (showAuth) return (
      <Auth key={showAuth} initialJoin={showAuth === 'join'} onBack={() => setShowAuth(null)} onUser={(account) => {
        setUser(account)
        setShowAuth(null)
        go('Home')
      }} />
    )
    const signIn = () => setShowAuth('sign-in')
    const join = () => setShowAuth('join')
    return (
      <div className="public-landing-shell">
        <header className="top-nav"><div className="top-nav-inner">
          <Brand onClick={() => go('Home')} />
          <nav className="nav-menu" aria-label="Main navigation">
            <button className="nav-item" onClick={join}>Rentals</button>
            <button className="nav-item" onClick={join}>Local Help</button>
          </nav>
          <div className="nav-actions"><button type="button" className="btn-secondary" onClick={signIn}>Sign in</button><button type="button" onClick={join}>Join NeighbourLink</button></div>
        </div></header>
        <main className="main-workspace"><Landing user={{ id: 0, name: '', area: 'Mumbai' }} go={join} openBooking={signIn} /></main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      {/* Sticky Desktop Topbar Navigation */}
      <header className="top-nav">
        <div className="top-nav-inner">
          <Brand onClick={() => go('Home')} />

          <nav className="nav-menu" aria-label="Main navigation">
            <button
              className="nav-item"
              aria-current={route === 'Home' ? 'page' : undefined}
              onClick={() => go('Home')}
            >
              <Icons.Home size={16} />
              <span>Home</span>
            </button>
            <button
              className="nav-item"
              aria-current={route === 'Rentals' ? 'page' : undefined}
              onClick={() => go('Rentals')}
            >
              <Icons.Package size={16} />
              <span>Rentals</span>
            </button>
            <button
              className="nav-item"
              aria-current={route === 'Local Help' ? 'page' : undefined}
              onClick={() => go('Local Help')}
            >
              <Icons.Handshake size={16} />
              <span>Local Help</span>
            </button>
            <button
              className="nav-item"
              aria-current={route === 'Bookings' || route.startsWith('booking/') ? 'page' : undefined}
              onClick={() => go('Bookings')}
            >
              <Icons.Calendar size={16} />
              <span>Bookings</span>
            </button>
            <button
              className="nav-item"
              aria-current={route === 'Dashboard' ? 'page' : undefined}
              onClick={() => go('Dashboard')}
            >
              <Icons.Shield size={16} />
              <span>Dashboard</span>
            </button>
          </nav>

          <div className="nav-actions">
            <span className="location-pill"><Icons.MapPin size={16} />{user.area || 'Your neighbourhood'}</span>
            <ThemeToggle />
            <button
              className="user-profile-menu"
              onClick={() => go('Profile')}
              title="Open profile"
              aria-label="User profile"
            >
              <div className="avatar-circle">
                {user.photo_id ? (
                  <img src={'/api/uploads/' + user.photo_id} alt={user.name} />
                ) : (
                  user.name?.[0]?.toUpperCase() || 'U'
                )}
              </div>
              <span style={{ fontSize: '0.88rem', fontWeight: 650, color: 'var(--text-main)' }}>
                {user.name.split(' ')[0]}
              </span>
            </button>

            <button
              className="btn-subtle btn-sm"
              onClick={async () => {
                try {
                  await api('/auth/logout', 'POST')
                  setUser(null)
                  setError('')
                  go('Home')
                } catch (e) {
                  setError((e as Error).message)
                }
              }}
              title="Sign out"
              aria-label="Sign out"
            >
              <Icons.LogOut size={16} />
              <span className="desktop-only">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace View */}
      <main className="main-workspace">
        {error && <p role="alert">{error}</p>}
        {user.state === 'restricted' && (
          <p role="status">Your account is restricted. You can view existing records.</p>
        )}

        {route.startsWith('booking/') ? (
          <Booking key={route} id={Number(route.split('/')[1])} user={user} onBack={() => go('Bookings')} />
        ) : route === 'Home' ? (
          <Home user={user} go={go} openBooking={openBooking} />
        ) : route === 'Local Help' ? (
          <Services user={user} openBooking={openBooking} />
        ) : route === 'Bookings' ? (
          <BookingList open={openBooking} />
        ) : route === 'Dashboard' ? (
          <Community user={user} openBooking={openBooking} />
        ) : route === 'Profile' ? (
          <Profile user={user} onUser={setUser} />
        ) : (
          <Rental user={user} openBooking={openBooking} />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <button
          className="mobile-nav-btn"
          aria-current={route === 'Home' ? 'page' : undefined}
          onClick={() => go('Home')}
        >
          <Icons.Home size={20} />
          <span>Home</span>
        </button>
        <button
          className="mobile-nav-btn"
          aria-current={route === 'Rentals' ? 'page' : undefined}
          onClick={() => go('Rentals')}
        >
          <Icons.Package size={20} />
          <span>Rentals</span>
        </button>
        <button
          className="mobile-nav-btn"
          aria-current={route === 'Local Help' ? 'page' : undefined}
          onClick={() => go('Local Help')}
        >
          <Icons.Handshake size={20} />
          <span>Help</span>
        </button>
        <button
          className="mobile-nav-btn"
          aria-current={route === 'Bookings' || route.startsWith('booking/') ? 'page' : undefined}
          onClick={() => go('Bookings')}
        >
          <Icons.Calendar size={20} />
          <span>Bookings</span>
        </button>
        <button
          className="mobile-nav-btn"
          aria-current={route === 'Dashboard' ? 'page' : undefined}
          onClick={() => go('Dashboard')}
        >
          <Icons.Shield size={20} />
          <span>Dashboard</span>
        </button>
        <button
          className="mobile-nav-btn"
          aria-current={route === 'Profile' ? 'page' : undefined}
          onClick={() => go('Profile')}
        >
          <Icons.User size={20} />
          <span>Profile</span>
        </button>
      </nav>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
