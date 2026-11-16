import { useEffect, useState } from 'react'
import { api, timeIST } from './api'
import { Icons } from './Icons'

export default function BlockedDates({ listingId }: { listingId: number }) {
  const [rows, setRows] = useState<any[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<number | null>(null)

  const load = () =>
    api('/rentals/listings/' + listingId + '/blackouts')
      .then(setRows)
      .catch((e) => setError(e.message))

  useEffect(() => {
    void load()
  }, [listingId])

  return (
    <section style={{ marginTop: '0.75rem' }}>
      <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
        Manually blocked dates
      </h4>
      {error && <p role="alert">{error}</p>}
      {!rows.length && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          No manually blocked intervals.
        </p>
      )}
      <div style={{ display: 'grid', gap: '0.45rem' }}>
        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.45rem 0.75rem',
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem'
            }}
          >
            <span>
              {timeIST(r.start_at)} — {timeIST(r.end_at)}
            </span>
            <button
              className="btn-subtle btn-sm"
              disabled={busy !== null}
              onClick={async () => {
                setBusy(r.id)
                setError('')
                try {
                  await api('/rentals/listings/' + listingId + '/blackouts/' + r.id, 'DELETE')
                  await load()
                } catch (e) {
                  setError((e as Error).message)
                } finally {
                  setBusy(null)
                }
              }}
              style={{ color: 'var(--error)' }}
            >
              <Icons.X size={14} />
              <span>Unblock</span>
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
