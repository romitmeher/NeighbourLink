import { useCallback, useEffect, useState } from 'react'
import { api, money } from './api'
import { Icons } from './Icons'

export default function Payments({
  user,
  booking,
  refresh
}: {
  user: any
  booking: any
  refresh: () => void
}) {
  const [finance, setFinance] = useState<any>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      setFinance(await api('/bookings/' + booking.id + '/finance'))
    } catch (error) {
      setMessage((error as Error).message)
    }
  }, [booking.id])

  useEffect(() => {
    setFinance(null)
    setMessage('')
    void reload()
    const timer = window.setInterval(() => {
      void reload()
    }, 15000)
    return () => window.clearInterval(timer)
  }, [reload])

  useEffect(() => {
    if (finance?.captured > 0 && booking.status === 'awaiting_payment') refresh()
  }, [finance?.captured, booking.status, refresh])

  async function pay() {
    setBusy(true)
    setMessage('')
    try {
      const payment = await api('/bookings/' + booking.id + '/checkout/demo', 'POST')
      setMessage(
        payment.status === 'captured'
          ? 'Demo payment completed and booking confirmed.'
          : 'Demo payment status: ' + payment.status
      )
      await reload()
      refresh()
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const isCustomer = user.id === booking.customer_id
  const isPayable = finance?.configured && finance.mode === 'demo' && isCustomer && booking.status === 'awaiting_payment'

  return (
    <section className="panel" style={{ marginTop: '1.5rem' }} aria-label="Payments">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem'
        }}
      >
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
            <Icons.CreditCard size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.1rem' }}>Payment & Ledger</h3>
            <small>{finance?.mode === 'test' ? 'Gateway test record' : 'Demo checkout · No real money moves'}</small>
          </div>
        </div>

        {finance && (
          <span
            className={`badge ${
              finance.status === 'captured'
                ? 'badge-primary'
                : finance.status === 'unpaid'
                ? 'badge-warning'
                : 'badge-neutral'
            }`}
          >
            Status: {finance.status.replaceAll('_', ' ')}
          </span>
        )}
      </div>

      {message && <p role="status">{message}</p>}

      {!finance ? (
        <p role="status">Loading payment ledger…</p>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              backgroundColor: '#FAFCFA',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '1.2rem',
              marginBottom: '1.2rem'
            }}
          >
            <div>
              <small style={{ color: 'var(--text-muted)' }}>Booking value</small>
              <strong style={{ display: 'block', fontSize: '1.25rem', color: 'var(--text-main)' }}>
                {money(finance.booking_value)}
              </strong>
            </div>

            <div>
              <small style={{ color: 'var(--text-muted)' }}>Captured payment</small>
              <strong
                style={{
                  display: 'block',
                  fontSize: '1.25rem',
                  color: finance.captured > 0 ? 'var(--primary)' : 'var(--text-main)'
                }}
              >
                {money(finance.captured)}
              </strong>
            </div>

            <div>
              <small style={{ color: 'var(--text-muted)' }}>Platform commission ({booking.commission_bps / 100}%)</small>
              <strong style={{ display: 'block', fontSize: '1.25rem', color: 'var(--text-main)' }}>
                {money(finance.commission)}
              </strong>
            </div>

            <div>
              <small style={{ color: 'var(--text-muted)' }}>Provider earnings (unsettled)</small>
              <strong style={{ display: 'block', fontSize: '1.25rem', color: 'var(--text-main)' }}>
                {money(finance.earnings)}
              </strong>
            </div>
          </div>

          {!finance.configured && (
            <div
              style={{
                padding: '0.85rem 1rem',
                backgroundColor: 'var(--warning-surface)',
                border: '1px solid var(--warning-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--warning)',
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1rem'
              }}
            >
              <Icons.AlertTriangle size={18} />
              <span>Payment checkout is unavailable in this environment.</span>
            </div>
          )}

          {isPayable && (
            <div
              style={{
                padding: '1.25rem',
                backgroundColor: 'var(--primary-light)',
                border: '1.5px solid var(--primary)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                marginBottom: '1rem'
              }}
            >
              <div>
                <strong style={{ fontSize: '1.05rem', color: 'var(--primary)' }}>
                  Both parties have accepted the agreement
                </strong>
                <p style={{ fontSize: '0.88rem', color: '#27584A', margin: '0.2rem 0 0' }}>
                  Complete the demo checkout of {money(finance.booking_value)} to confirm this reservation.
                </p>
              </div>

              <button type="button" disabled={busy} onClick={pay} className="btn-lg">
                <Icons.CreditCard size={18} />
                <span>
                  {busy ? 'Processing…' : `Pay ${money(finance.booking_value)} in demo mode`}
                </span>
              </button>
            </div>
          )}

          {finance.captured > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid #EEF3EF'
              }}
            >
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {finance.mode === 'demo' ? 'Demo payment recorded. No real money moved.' : 'Test payment recorded.'} Receipt available for download.
              </span>
              <a
                href={`/api/bookings/${booking.id}/receipt`}
                download
                className="btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Icons.Download size={14} />
                <span>Download payment receipt (PDF)</span>
              </a>
            </div>
          )}

          {finance.refunds.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ fontSize: '0.92rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                Refund records
              </h4>
              {finance.refunds.map((r: any, i: number) => (
                <div
                  key={i}
                  style={{
                    padding: '0.5rem 0.75rem',
                    backgroundColor: '#FAFCFA',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.85rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '0.35rem'
                  }}
                >
                  <span>
                    Refund {money(r.amount)} · Reason: {r.reason}
                  </span>
                  <span className="badge badge-neutral">{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
