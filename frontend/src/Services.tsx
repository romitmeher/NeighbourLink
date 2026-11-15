import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, money, timeIST } from './api'
import { RequestMessages } from './Community'
import Reputation from './Reputation'
import { Icons } from './Icons'

type Item = Record<string, any>
type User = { id: number }
type HelpProps = { user: User; openBooking: (id: number) => void }
type FieldProps = {
  name: string
  label: string
  type?: string
  value?: string | number
  min?: number
  max?: number
  step?: string
  required?: boolean
  placeholder?: string
}

function Field({
  name,
  label,
  type = 'text',
  value,
  min,
  max,
  step,
  required = true,
  placeholder
}: FieldProps) {
  return (
    <label>
      <span>{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={value}
        min={min}
        max={max}
        step={step}
        required={required}
        placeholder={placeholder}
      />
    </label>
  )
}

function ActionForm({
  onSave,
  children,
  label,
  icon
}: {
  onSave: (f: FormData) => Promise<void>
  children: ReactNode
  label: string
  icon?: ReactNode
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setError('')
    setSuccess(false)
    setBusy(true)
    try {
      await onSave(data)
      setSuccess(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '1rem' }}>
      {children}
      {error && <p role="alert">{error}</p>}
      {success && <p role="status">Saved successfully.</p>}
      <button disabled={busy} className="btn-lg" style={{ width: 'fit-content' }}>
        {icon}
        <span>{busy ? 'Saving…' : label}</span>
      </button>
    </form>
  )
}

const val = (data: FormData, key: string) => String(data.get(key) || '').trim()
const paise = (data: FormData, key: string) => Math.round(Number(val(data, key)) * 100)

function Options({
  name,
  label,
  values,
  initial
}: {
  name: string
  label: string
  values: string[]
  initial?: string
}) {
  return (
    <label>
      <span>{label}</span>
      <select name={name} required defaultValue={initial}>
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  )
}

function Note({
  name,
  label,
  value,
  required = true,
  placeholder
}: {
  name: string
  label: string
  value?: string
  required?: boolean
  placeholder?: string
}) {
  return (
    <label>
      <span>{label}</span>
      <textarea
        name={name}
        defaultValue={value}
        required={required}
        maxLength={2000}
        placeholder={placeholder}
      />
    </label>
  )
}

async function photos(data: FormData, isPublic: boolean) {
  const files = data.getAll('images').filter((v): v is File => v instanceof File && v.size > 0)
  if (files.length > 8) throw Error('Maximum 8 images allowed.')
  const ids: number[] = []
  for (const file of files) {
    const upload = new FormData()
    upload.set('file', file)
    upload.set('public', String(isPublic))
    ids.push((await api('/uploads', 'POST', upload)).id)
  }
  return ids
}

function Images({ label }: { label: string }) {
  return (
    <label>
      <span>{label}</span>
      <input type="file" name="images" multiple accept="image/jpeg,image/png,image/webp" />
    </label>
  )
}

function ProviderForm({
  profile,
  categories,
  done
}: {
  profile?: Item
  categories: string[]
  done: () => Promise<void>
}) {
  return (
    <div className="panel" style={{ maxWidth: '680px', margin: '0 auto' }}>
      <h3 style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>Your helper & provider profile</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Configure your services, rates and self-declared experience so neighbours can book you.
      </p>

      <ActionForm
        label="Save provider profile"
        icon={<Icons.Check size={16} />}
        onSave={async (data) => {
          const uploaded = await photos(data, true)
          await api('/help/profile', 'PUT', {
            adult_declared: data.has('adult'),
            bio: val(data, 'bio'),
            categories: data.getAll('categories'),
            offerings: data.getAll('offerings'),
            experience: val(data, 'experience'),
            qualifications: val(data, 'qualifications'),
            availability: val(data, 'availability'),
            area: val(data, 'area'),
            basis: val(data, 'basis'),
            rate: paise(data, 'rate'),
            sample_ids: uploaded.length ? uploaded : profile?.sample_ids || []
          })
          await done()
        }}
      >
        <Note
          name="bio"
          label="About your services"
          value={profile?.bio}
          placeholder="Describe your background, skills, and types of tasks you enjoy doing"
        />

        <fieldset>
          <legend>Service categories</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {categories.map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  name="categories"
                  value={c}
                  defaultChecked={profile?.categories?.includes(c)}
                />
                <span>{c}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Offerings level</legend>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            {['everyday', 'professional'].map((s) => (
              <label key={s}>
                <input
                  type="checkbox"
                  name="offerings"
                  value={s}
                  defaultChecked={profile?.offerings?.includes(s)}
                />
                <span style={{ textTransform: 'capitalize' }}>{s} helper</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Field
            name="area"
            label="Approximate service area"
            value={profile?.area}
            placeholder="e.g. Bandra West, Mumbai"
          />
          <Field
            name="availability"
            label="Availability notes"
            value={profile?.availability}
            placeholder="e.g. Weekday evenings & weekends"
          />
        </div>

        <Field
          name="experience"
          label="Experience (self-declared)"
          value={profile?.experience}
          placeholder="e.g. 4 years assembling IKEA & Godrej furniture"
        />
        <Field
          name="qualifications"
          label="Qualifications / certifications (self-declared, optional)"
          required={false}
          value={profile?.qualifications}
          placeholder="e.g. Certified Electrician / IT Diploma"
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Options
            name="basis"
            label="Pricing basis"
            values={['fixed', 'hourly', 'inspection']}
            initial={profile?.basis || 'fixed'}
          />
          <Field
            name="rate"
            label="Indicative rate (₹ INR)"
            type="number"
            min={0.01}
            step=".01"
            value={profile?.rate ? profile.rate / 100 : 400}
          />
        </div>

        <Images label="Work samples (public photos)" />

        <label style={{ marginTop: '0.5rem' }}>
          <input
            type="checkbox"
            name="adult"
            required
            defaultChecked={!!profile?.adult_declared}
          />
          <span>I declare that I am at least 18 years old and competent to offer services.</span>
        </label>
      </ActionForm>
    </div>
  )
}

function TaskForm({
  target,
  categories,
  done
}: {
  target: Item | null
  categories: string[]
  done: () => Promise<void>
}) {
  const requestCategories = categories.includes('Custom request')
    ? categories
    : [...categories, 'Custom request']
  return (
    <div className="panel" style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.2rem' }}>
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
          <Icons.Handshake size={22} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.4rem', marginBottom: '0.1rem' }}>
            {target ? `Request a quote from ${target.name}` : 'Post a task to the neighbourhood board'}
          </h3>
          <small>
            {target
              ? `Direct task request for ${target.name}`
              : 'Public task board where all matching providers can send quotes'}
          </small>
        </div>
      </div>

      <ActionForm
        label={target ? 'Send request to provider' : 'Publish task to board'}
        icon={<Icons.ArrowRight size={16} />}
        onSave={async (data) => {
          await api('/help/requests', 'POST', {
            title: val(data, 'title'),
            description: val(data, 'description'),
            category: val(data, 'category'),
            area: val(data, 'area'),
            preferred_schedule: val(data, 'schedule'),
            materials: val(data, 'materials'),
            budget: val(data, 'budget') ? paise(data, 'budget') : null,
            target_provider_id: target?.user_id ?? null,
            photo_ids: await photos(data, !target)
          })
          await done()
        }}
      >
        <Field
          name="title"
          label="Task title"
          placeholder="e.g. Assemble 6-tier wooden bookcase and mount shelf"
        />

        <Options
          name="category"
          label="Category"
          values={target ? [...target.categories, 'Custom request'] : requestCategories}
        />

        <Note
          name="description"
          label="What needs doing?"
          placeholder="Provide specific details about dimensions, access, stairs, or special requirements"
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Field name="area" label="Approximate location" placeholder="e.g. Dadar, Mumbai" />
          <Field
            name="schedule"
            label="Preferred day and time"
            placeholder="e.g. Saturday afternoon around 3 PM"
          />
        </div>

        <Field
          name="materials"
          label="Who provides tools & materials?"
          placeholder="e.g. I have the screws and manual; helper brings drill and level"
        />

        <Field
          name="budget"
          label="Optional budget guide (₹ INR)"
          type="number"
          required={false}
          min={0.01}
          step=".01"
          placeholder="e.g. 800"
        />

        <Images label={target ? 'Private reference photos' : 'Public task photos'} />
      </ActionForm>
    </div>
  )
}

function OfferForm({
  path,
  done,
  follow = false
}: {
  path: string
  done: () => void
  follow?: boolean
}) {
  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '1.2rem',
        backgroundColor: '#FFFFFF',
        border: '1.5px solid var(--border)',
        borderRadius: 'var(--radius-md)'
      }}
    >
      <ActionForm
        label={follow ? 'Send separate work quote' : 'Submit formal quote'}
        icon={<Icons.Check size={16} />}
        onSave={async (data) => {
          function instant(key: string) {
            return new Date(val(data, key) + ':00+05:30').toISOString()
          }
          await api(path, 'POST', {
            basis: val(data, 'basis'),
            rate: paise(data, 'rate'),
            max_minutes: Number(val(data, 'minutes')),
            travel: paise(data, 'travel'),
            scope: val(data, 'scope'),
            materials: val(data, 'materials'),
            exclusions: val(data, 'exclusions'),
            expires_at: instant('expires'),
            start_at: instant('start'),
            end_at: instant('end')
          })
          await done()
        }}
      >
        <Options
          name="basis"
          label="Quote basis"
          values={follow ? ['fixed', 'hourly'] : ['fixed', 'hourly', 'inspection']}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Field
            name="rate"
            label="Fixed fee or hourly rate (₹ INR)"
            type="number"
            min={0.01}
            step=".01"
          />
          <Field
            name="travel"
            label="Travel charges (₹ INR)"
            type="number"
            min={0}
            step=".01"
            value={0}
          />
        </div>

        <Field
          name="minutes"
          label="Estimated minutes (approved cap for hourly work)"
          type="number"
          min={1}
          max={1440}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <Field name="start" label="Appointment starts (IST)" type="datetime-local" />
          <Field name="end" label="Appointment ends (IST)" type="datetime-local" />
          <Field name="expires" label="Quote expires (IST)" type="datetime-local" />
        </div>

        <Note
          name="scope"
          label="Included scope of work"
          placeholder="Clear description of what will be done"
        />
        <Field
          name="materials"
          label="Tools and materials provided"
          placeholder="e.g. Provider brings power tools, customer provides brackets"
        />
        <Field
          name="exclusions"
          label="Excluded work"
          placeholder="e.g. Electrical wiring, wall painting"
        />
      </ActionForm>
    </div>
  )
}

function Request({
  item,
  profile,
  user,
  openBooking,
  reload
}: { item: Item; profile?: Item; reload: () => Promise<void> } & HelpProps) {
  const [offers, setOffers] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const owner = item.customer_id === user.id
  const eligible =
    item.details.category === 'Custom request' ||
    !!profile?.categories?.includes(item.details.category)
  const mine = offers.find((o) => o.provider_id === user.id)
  const d = item.details

  const load = async () => {
    setLoading(true)
    try {
      setOffers(await api('/help/requests/' + item.id + '/offers'))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [item.id, item.status])

  const hasBooking =
    item.booking_id && (owner || item.target_provider_id === user.id || mine?.status === 'selected')

  return (
    <article className="card" style={{ display: 'grid', gap: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', gap: '0.45rem', marginBottom: '0.35rem' }}>
            <span className="badge badge-primary">{d.category}</span>
            <span className="badge badge-neutral">
              {item.target_provider_id ? 'Direct request' : 'Public task'}
            </span>
            <span className="badge badge-info">{item.status}</span>
          </div>
          <h3 style={{ fontSize: '1.25rem' }}>{d.title}</h3>
        </div>

        {d.budget && (
          <div style={{ textAlign: 'right' }}>
            <small style={{ color: 'var(--text-muted)' }}>Budget guide</small>
            <strong style={{ fontSize: '1.2rem', color: 'var(--primary)', display: 'block' }}>
              {money(d.budget)}
            </strong>
          </div>
        )}
      </div>

      <p style={{ color: 'var(--text-main)', fontSize: '0.92rem' }}>{d.description}</p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          fontSize: '0.85rem',
          color: 'var(--text-muted)',
          backgroundColor: '#FAFCFA',
          padding: '0.65rem 0.95rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <Icons.MapPin size={14} /> {d.area}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <Icons.Clock size={14} /> {d.preferred_schedule}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <Icons.Wrench size={14} /> Tools: {d.materials}
        </span>
      </div>

      {item.parent_booking_id && (
        <span className="badge badge-warning">
          Follow-up to inspection #{item.parent_booking_id}
        </span>
      )}

      {d.photo_ids?.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0.3rem 0' }}>
          {d.photo_ids.map((id: number) => (
            <a
              key={id}
              href={'/api/help/requests/' + item.id + '/photos/' + id}
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={'/api/help/requests/' + item.id + '/photos/' + id}
                alt="Task reference"
                style={{ height: '70px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' }}
              />
            </a>
          ))}
        </div>
      )}

      {hasBooking && (
        <button
          onClick={() => openBooking(item.booking_id)}
          className="btn-lg"
          style={{ width: 'fit-content' }}
        >
          <Icons.Calendar size={16} />
          <span>Open booking workspace #{item.booking_id}</span>
        </button>
      )}

      {loading && <p role="status">Loading quotations…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && !offers.length && owner && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          No quotes submitted yet. When providers respond, their offers will appear here.
        </p>
      )}

      {/* Structured Offers List */}
      {offers.length > 0 && (
        <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.5rem' }}>
          <h4 style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>
            Submitted quotes ({offers.length})
          </h4>
          {offers.map((o) => (
            <div
              key={o.id}
              style={{
                backgroundColor: '#FAFCFA',
                border: '1.5px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '1.1rem',
                display: 'grid',
                gap: '0.65rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ fontSize: '1.05rem' }}>{o.provider_name}</strong>
                  <span className="badge badge-primary" style={{ marginLeft: '0.5rem' }}>
                    {o.terms.basis}
                  </span>
                  <span className="badge badge-neutral" style={{ marginLeft: '0.25rem' }}>
                    {o.status}
                  </span>
                </div>
                <strong style={{ fontSize: '1.2rem', color: 'var(--primary)' }}>
                  {money(
                    (o.terms.basis === 'hourly'
                      ? Math.round((o.terms.rate * o.terms.max_minutes) / 60)
                      : o.terms.rate) + o.terms.travel
                  )}
                </strong>
              </div>

              <p style={{ fontSize: '0.88rem', color: 'var(--text-main)' }}>{o.terms.scope}</p>
              <small style={{ color: 'var(--text-muted)' }}>
                Excludes: {o.terms.exclusions} · Tools: {o.terms.materials} · Max {o.terms.max_minutes} mins · Travel {money(o.terms.travel)}
              </small>
              <small style={{ color: 'var(--text-muted)' }}>
                Appointment: {timeIST(o.terms.start_at)} to {timeIST(o.terms.end_at)} · Quote expires {timeIST(o.terms.expires_at)}
              </small>

              {owner && item.status === 'open' && (
                <ActionForm
                  label="Accept this quote & proceed to agreement"
                  icon={<Icons.Check size={16} />}
                  onSave={async () => {
                    const b = await api(
                      '/help/requests/' + item.id + '/offers/' + o.id + '/accept',
                      'POST'
                    )
                    await reload()
                    openBooking(b.booking_id)
                  }}
                >
                  {null}
                </ActionForm>
              )}

              {!item.target_provider_id && (
                <RequestMessages requestId={item.id} providerId={o.provider_id} />
              )}
            </div>
          ))}
        </div>
      )}

      {item.target_provider_id && (
        <RequestMessages requestId={item.id} providerId={item.target_provider_id} />
      )}

      {!owner && eligible && item.status === 'open' && (
        <details style={{ marginTop: '0.5rem' }}>
          <summary style={{ fontFamily: 'var(--font-heading)', color: 'var(--primary)' }}>
            {mine ? 'Revise your quote' : 'Submit a quote for this task'}
          </summary>
          <OfferForm path={'/help/requests/' + item.id + '/offers'} done={load} />
        </details>
      )}

      {(owner || item.target_provider_id === user.id) && item.status === 'open' && (
        <ActionForm
          label="Close / Decline request"
          icon={<Icons.X size={16} />}
          onSave={async () => {
            await api('/help/requests/' + item.id + '/decline', 'POST')
            await reload()
          }}
        >
          {null}
        </ActionForm>
      )}
    </article>
  )
}

export function ServiceActions({
  booking,
  user,
  reload
}: {
  booking: Item
  user: User
  reload: () => void
}) {
  const [detail, setDetail] = useState<Item | null>(null)
  const [error, setError] = useState('')
  const base = '/help/bookings/' + booking.id
  const mine = user.id === booking.provider_id

  useEffect(() => {
    if (booking.kind !== 'service') return
    api(base + '/delivery')
      .then(setDetail)
      .catch((e) => setError(e.message))
  }, [base, booking.status, booking.kind])

  if (booking.kind !== 'service') return null

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
          <Icons.Handshake size={20} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.1rem' }}>Service delivery & completion</h3>
          <small>
            Rate: {money(booking.terms.rate)} · {booking.terms.basis} · {booking.status.replaceAll('_', ' ')}
          </small>
        </div>
      </div>

      {error && <p role="alert">{error}</p>}

      {[booking.customer_id, booking.provider_id].includes(user.id) &&
        ['awaiting_agreement', 'awaiting_payment', 'confirmed', 'in_progress', 'completion_proposed'].includes(
          booking.status
        ) && (
          <details style={{ marginBottom: '1rem' }}>
            <summary>Cancel booking or request review</summary>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              Before work starts, cancellation queues a full refund of any captured payment. After work begins,
              a review report is generated.
            </p>
            <ActionForm
              label="Submit cancellation request"
              icon={<Icons.AlertTriangle size={16} />}
              onSave={async (f) => {
                await api(base + '/cancel', 'POST', { reason: val(f, 'reason') })
                reload()
              }}
            >
              <Note name="reason" label="Reason for cancellation" />
            </ActionForm>
          </details>
        )}

      {detail?.completion_note && (
        <div
          style={{
            padding: '0.85rem',
            backgroundColor: 'var(--success-surface)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1rem'
          }}
        >
          <strong style={{ display: 'block', color: 'var(--success)' }}>Proposed completion:</strong>
          <p style={{ margin: '0.2rem 0' }}>{detail.completion_note}</p>
          {detail.minutes && <small>Actual time: {detail.minutes} minutes</small>}
        </div>
      )}

      {detail?.dispute && (
        <div
          style={{
            padding: '0.85rem',
            backgroundColor: 'var(--error-surface)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1rem'
          }}
        >
          <strong style={{ color: 'var(--error)' }}>Dispute notes:</strong>
          <p>{detail.dispute}</p>
        </div>
      )}

      {mine && booking.status === 'confirmed' && (
        <ActionForm
          label="Start work (appointment has begun)"
          icon={<Icons.Wrench size={16} />}
          onSave={async () => {
            await api(base + '/start', 'POST')
            reload()
          }}
        >
          {null}
        </ActionForm>
      )}

      {mine && booking.status === 'in_progress' && (
        <ActionForm
          label="Propose completion"
          icon={<Icons.Check size={16} />}
          onSave={async (f) => {
            await api(base + '/propose', 'POST', {
              note: val(f, 'note'),
              minutes: f.has('minutes') ? Number(val(f, 'minutes')) : null
            })
            reload()
          }}
        >
          <Note name="note" label="Summary of completed work" />
          {booking.terms.basis === 'hourly' && (
            <Field
              name="minutes"
              type="number"
              label="Actual minutes worked"
              min={1}
              max={booking.terms.max_minutes}
            />
          )}
        </ActionForm>
      )}

      {!mine && user.id === booking.customer_id && booking.status === 'completion_proposed' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <ActionForm
            label="Confirm completed work & authorise release"
            icon={<Icons.CheckCircle2 size={16} />}
            onSave={async () => {
              await api(base + '/confirm', 'POST')
              reload()
            }}
          >
            {null}
          </ActionForm>

          <ActionForm
            label="Dispute completion"
            icon={<Icons.AlertTriangle size={16} />}
            onSave={async (f) => {
              await api(base + '/dispute', 'POST', { reason: val(f, 'reason') })
              reload()
            }}
          >
            <Note name="reason" label="Describe the issue with the work" />
          </ActionForm>
        </div>
      )}

      {mine && booking.status === 'completed' && booking.terms.basis === 'inspection' && (
        <details style={{ marginTop: '1rem' }}>
          <summary>Quote for separate follow-up work</summary>
          <OfferForm path={base + '/follow-up'} follow done={reload} />
        </details>
      )}
    </section>
  )
}

export default function Services({ user, openBooking }: HelpProps) {
  const [tab, setTab] = useState('Providers')
  const [providers, setProviders] = useState<Item[]>([])
  const [requests, setRequests] = useState<Item[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [target, setTarget] = useState<Item | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<Item | null>(null)
  const [area, setArea] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const [p, r, c] = await Promise.all([
        api('/help/providers'),
        api('/help/requests'),
        api('/community/categories?kind=service')
      ])
      setProviders(p)
      setRequests(r)
      setCategories(c)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [user.id])

  const profile = providers.find((p) => p.user_id === user.id)
  const results = providers.filter(
    (p) =>
      p.area.toLowerCase().includes(area.toLowerCase()) &&
      (!category || p.categories.includes(category))
  )

  return (
    <div>
      <div className="page-header">
        <div className="page-header-title">
          <small>COMMUNITY TALENT</small>
          <h2>Local Help services</h2>
        </div>

        <div className="page-header-actions">
          <div className="segmented-tabs">
            {['Providers', 'Task board', 'Post a task', 'My provider profile'].map((t) => (
              <button
                key={t}
                className={`segmented-tab ${tab === t ? 'active' : ''}`}
                onClick={() => {
                  setTarget(null)
                  setTab(t)
                }}
                aria-pressed={tab === t}
              >
                <span>{t}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <p role="status">Loading Local Help…</p>}
      {error && (
        <p role="alert">
          {error} <button onClick={refresh}>Retry</button>
        </p>
      )}

      {/* View 1: Provider Directory */}
      {!loading && !error && tab === 'Providers' && (
        <>
          <div className="filter-toolbar">
            <label>
              <span>Filter by area</span>
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Bandra, Dadar"
              />
            </label>
            <label>
              <span>Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>

          {!results.length && (
            <div className="empty-state" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
              <h3>No providers match this search</h3>
              <p style={{ color: 'var(--text-muted)' }}>Try selecting a broader area or category.</p>
            </div>
          )}

          <div className="listing-grid">
            {results.map((p) => (
              <article className="card" key={p.user_id} style={{ display: 'grid', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--primary-light)',
                      color: 'var(--primary)',
                      display: 'grid',
                      placeItems: 'center',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 800,
                      fontSize: '1.2rem',
                      border: '2px solid var(--border)'
                    }}
                  >
                    {p.name?.[0]?.toUpperCase() || 'P'}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '0.15rem' }}>{p.name}</h3>
                    <small style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Icons.MapPin size={12} />
                      {p.area}
                    </small>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {p.offerings?.map((o: string) => (
                    <span key={o} className="badge badge-primary">
                      {o}
                    </span>
                  ))}
                  {p.categories?.slice(0, 2).map((c: string) => (
                    <span key={c} className="badge badge-neutral">
                      {c}
                    </span>
                  ))}
                </div>

                <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                  {p.bio}
                </p>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0',
                    borderTop: '1px solid #EEF3EF'
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '1.15rem', color: 'var(--primary)' }}>
                      {money(p.rate)}
                    </strong>
                    <small style={{ marginLeft: '0.3rem', color: 'var(--text-muted)' }}>
                      / {p.basis}
                    </small>
                  </div>
                  <Reputation userId={p.user_id} kind="service" />
                </div>

                <div style={{ display: 'flex', gap: '0.65rem', marginTop: '0.35rem' }}>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => setSelectedProvider(p)}
                    style={{ flex: 1 }}
                  >
                    View profile
                  </button>

                  {p.user_id !== user.id && (
                    <button
                      className="btn-sm"
                      onClick={() => {
                        setTarget(p)
                        setTab('Post a task')
                      }}
                      style={{ flex: 1 }}
                    >
                      <span>Request quote</span>
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {/* Provider Details Modal */}
      {selectedProvider && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--primary-light)',
                    color: 'var(--primary)',
                    display: 'grid',
                    placeItems: 'center',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 800,
                    fontSize: '1.6rem',
                    border: '2px solid var(--border)'
                  }}
                >
                  {selectedProvider.name?.[0]?.toUpperCase() || 'P'}
                </div>
                <div>
                  <h2 style={{ fontSize: '1.5rem', marginBottom: '0.2rem' }}>{selectedProvider.name}</h2>
                  <small style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Icons.MapPin size={14} />
                    {selectedProvider.area}
                  </small>
                </div>
              </div>

              <button
                type="button"
                className="btn-subtle btn-sm"
                onClick={() => setSelectedProvider(null)}
              >
                <Icons.X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: '1rem', fontSize: '0.92rem' }}>
              <div>
                <strong style={{ display: 'block', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                  About
                </strong>
                <p style={{ color: 'var(--text-muted)' }}>{selectedProvider.bio}</p>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--primary-light)',
                  borderRadius: 'var(--radius-md)'
                }}
              >
                <span>Indicative rate</span>
                <strong style={{ fontSize: '1.25rem', color: 'var(--primary)' }}>
                  {money(selectedProvider.rate)} ({selectedProvider.basis})
                </strong>
              </div>

              <div>
                <strong style={{ display: 'block', marginBottom: '0.2rem' }}>
                  Self-declared experience
                </strong>
                <p style={{ color: 'var(--text-muted)' }}>{selectedProvider.experience}</p>
              </div>

              {selectedProvider.qualifications && (
                <div>
                  <strong style={{ display: 'block', marginBottom: '0.2rem' }}>
                    Qualifications (self-declared)
                  </strong>
                  <p style={{ color: 'var(--text-muted)' }}>{selectedProvider.qualifications}</p>
                </div>
              )}

              <div>
                <strong style={{ display: 'block', marginBottom: '0.2rem' }}>Availability</strong>
                <p style={{ color: 'var(--text-muted)' }}>{selectedProvider.availability}</p>
              </div>

              {selectedProvider.sample_ids?.length > 0 && (
                <div>
                  <strong style={{ display: 'block', marginBottom: '0.4rem' }}>Work samples</strong>
                  <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto' }}>
                    {selectedProvider.sample_ids.map((id: number) => (
                      <img
                        key={id}
                        src={'/api/uploads/' + id}
                        alt="Work sample"
                        style={{ height: '90px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <Reputation userId={selectedProvider.user_id} kind="service" />

              {selectedProvider.user_id !== user.id && (
                <button
                  className="btn-lg"
                  onClick={() => {
                    setTarget(selectedProvider)
                    setSelectedProvider(null)
                    setTab('Post a task')
                  }}
                  style={{ marginTop: '0.5rem' }}
                >
                  <Icons.Handshake size={16} />
                  <span>Request a quotation from {selectedProvider.name}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View 2: Task Board */}
      {!loading && !error && tab === 'Task board' && (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Showing requests relevant to your account and neighbourhood
            </span>
            <button className="btn-secondary btn-sm" onClick={refresh}>
              <Icons.RefreshCw size={14} />
              <span>Refresh board</span>
            </button>
          </div>

          {!requests.length && (
            <div className="empty-state" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
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
                <Icons.Handshake size={28} />
              </div>
              <h3>No tasks on the board yet</h3>
              <p style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '0.4rem auto 1.5rem' }}>
                Post a task to ask local neighbours for help, or check back soon for requests needing your skills.
              </p>
              <button onClick={() => setTab('Post a task')}>
                <Icons.Plus size={16} />
                <span>Post a task</span>
              </button>
            </div>
          )}

          {requests.map((r) => (
            <Request
              key={r.id}
              item={r}
              profile={profile}
              reload={refresh}
              user={user}
              openBooking={openBooking}
            />
          ))}
        </div>
      )}

      {/* View 3: Post a Task Form */}
      {!loading && !error && tab === 'Post a task' && (
        <TaskForm
          key={target?.user_id ?? 'public'}
          target={target}
          categories={categories}
          done={async () => {
            setTab('Task board')
            await refresh()
          }}
        />
      )}

      {/* View 4: Provider Profile Form */}
      {!loading && !error && tab === 'My provider profile' && (
        <ProviderForm
          profile={profile}
          categories={categories}
          done={async () => {
            setTab('Providers')
            await refresh()
          }}
        />
      )}
    </div>
  )
}
