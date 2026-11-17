import { useEffect, useState } from 'react'
import { Icons } from './Icons'
import { rentalPhoto } from './rentalPhoto'

export default function RentalImage({ item }: { item: { title: string; category: string; photos?: number[]; description?: string } }) {
  const photoId = item.photos?.[0]
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [photoId, item.title])
  const demo = item.description?.startsWith('Fictional demonstration listing.')
  const source = photoId ? `/api/uploads/${photoId}` : demo ? rentalPhoto(item.title, item.category) : null
  if (!source || failed) return <span className="rental-photo-placeholder"><Icons.Camera size={34} /><span>{photoId ? 'Photo unavailable' : 'No photo provided'}</span></span>
  return <img className="rental-photo" src={source} alt={item.title} loading="lazy" onError={() => setFailed(true)} />
}
