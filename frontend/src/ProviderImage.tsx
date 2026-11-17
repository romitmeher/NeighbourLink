import { useEffect, useState } from 'react'
import { Icons } from './Icons'
import { providerPortrait } from './providerPortrait'

type Variant = 'card' | 'modal' | 'landing'

export default function ProviderImage({ name, photoId, variant }: {
  name: string
  photoId?: number | null
  variant: Variant
}) {
  const [failed, setFailed] = useState(0)
  useEffect(() => setFailed(0), [name, photoId])

  const illustrated = providerPortrait(name)
  const sources = [photoId ? `/api/uploads/${photoId}` : null, illustrated].filter((value): value is string => !!value)
  const src = sources[failed]
  const className = variant === 'card' ? 'help-provider-portrait' : variant === 'modal' ? 'help-modal-portrait' : 'landing-person-avatar'

  if (src) {
    return <img className={className} src={src}
      alt={variant === 'landing' ? '' : src === illustrated ? `Illustrative portrait of ${name}` : `${name}'s profile photo`}
      loading="lazy" onError={() => setFailed((count) => count + 1)} />
  }

  return <span className={`${className} provider-photo-placeholder`} role="img" aria-label={`${name} has not added a profile photo`}>
    <Icons.Camera size={variant === 'card' ? 48 : 23} />
    {variant === 'card' && <small>Photo not added</small>}
  </span>
}
