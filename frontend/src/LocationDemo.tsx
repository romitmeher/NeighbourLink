import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icons } from './Icons'

export default function LocationDemo({ userId, area }: { userId: number; area?: string }) {
  const storageKey = `neighbourlink-demo-location-${userId}`
  const [location, setLocation] = useState(() => {
    try { return localStorage.getItem(storageKey) || area || 'Your neighbourhood' } catch { return area || 'Your neighbourhood' }
  })
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(location)
  const [error, setError] = useState('')
  return <>
    <button type="button" className="location-pill" aria-haspopup="dialog" onClick={() => { setDraft(location); setError(''); setOpen(true) }}><Icons.MapPin size={16} />{location}</button>
    {open && createPortal(<div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="location-title" onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}>
      <div className="modal-content location-demo-dialog">
        <div className="location-demo-heading"><h2 id="location-title">Your neighbourhood</h2><button type="button" className="btn-secondary" aria-label="Close location picker" onClick={() => setOpen(false)}><Icons.X size={18} /></button></div>
        <p>This is a location demo. Changing it updates this location label only. Listings stay the same.</p>
        <form onSubmit={(event) => {
          event.preventDefault()
          const value = draft.trim()
          if (value.length < 2) { setError('Enter an area or city with at least two characters.'); return }
          setLocation(value)
          try { localStorage.setItem(storageKey, value) } catch { /* The selection still works for this session. */ }
          setOpen(false)
        }}>
          <label><span>Area or city</span><input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="e.g. Borivali, Mumbai" maxLength={120} required /></label>
          <div className="location-demo-options">{['Borivali, Mumbai', 'Dadar, Mumbai', 'Bandra, Mumbai', 'Virar'].map((name) => <button type="button" className="btn-secondary" key={name} onClick={() => setDraft(name)}>{name}</button>)}</div>
          {error && <p role="alert">{error}</p>}
          <button type="submit">Save demo location</button>
        </form>
      </div>
    </div>, document.body)}
  </>
}
