import { useEffect, useState } from 'react'
import { Icons } from './Icons'
import { matchingRentalPhoto, rentalPhoto } from './rentalPhoto'

export default function RentalImage({ item }: { item: { title: string; category: string; photos?: number[]; description?: string } }) {
  const photoIds = item.photos || []
  const photoKey = photoIds.join(',')
  const [photoIndex, setPhotoIndex] = useState(0)
  const [exampleFailed, setExampleFailed] = useState(false)
  useEffect(() => { setPhotoIndex(0); setExampleFailed(false) }, [photoKey, item.title])
  const demo = item.description?.startsWith('Fictional demonstration listing.')
  const photoId = photoIds[photoIndex]
  if (photoId) return <img className="rental-photo" src={`/api/uploads/${photoId}`} alt={item.title} loading="lazy" onError={() => setPhotoIndex((index) => index + 1)} />
  const example = demo ? rentalPhoto(item.title, item.category) : matchingRentalPhoto(item.title)
  if (example && !exampleFailed) return <span className="rental-example-photo"><img className="rental-photo" src={example} alt={`Example image of ${item.title}`} loading="lazy" onError={() => setExampleFailed(true)} /><span className="rental-example-label">Example image</span></span>
  return <span className="rental-photo-placeholder"><Icons.Camera size={34} /><span>{photoIds.length ? 'Photo unavailable' : 'No photo provided'}</span></span>
}
