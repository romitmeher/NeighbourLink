import { useEffect, useState } from 'react'
import { api } from './api'
import { Icons } from './Icons'

export default function Reputation({
  userId,
  kind
}: {
  userId: number
  kind: 'service' | 'rental'
}) {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    let alive = true
    api('/community/ratings/' + userId)
      .then((v) => {
        if (alive) setData(v[kind])
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [userId, kind])

  if (!data) return null

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        fontSize: '0.8rem',
        color: '#D97706',
        fontWeight: 600,
        margin: '0.2rem 0'
      }}
    >
      {data.count ? (
        <>
          <Icons.Star size={14} style={{ fill: '#D97706' }} />
          <span>{data.average}</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
            ({data.count} {kind} {data.count === 1 ? 'review' : 'reviews'})
          </span>
        </>
      ) : (
        <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>
          No {kind} reviews yet
        </span>
      )}
    </div>
  )
}
