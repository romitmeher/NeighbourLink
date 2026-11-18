const photos = [
  ['picnic table', 'picnic-table'],
  ['vacuum', 'vacuum'],
  ['camping chair', 'camping-chairs'],
  ['speaker', 'speaker'],
  ['ladder', 'ladder'],
  ['drill', 'drill'],
  ['tent', 'tent'],
  ['projector', 'projector'],
  ['bike', 'bike'],
  ['motorcycle', 'bike'],
  ['scooter', 'bike'],
  ['bus', 'bus']
] as const

export function matchingRentalPhoto(title: string): string | null {
  const name = title.toLowerCase()
  const match = photos.find(([keyword]) => name.includes(keyword))
  return match ? `/rental-photos/${match[1]}.png` : null
}

export function rentalPhoto(title: string, category: string) {
  const match = matchingRentalPhoto(title)
  if (match) return match
  const group = category.toLowerCase()

  if (group.includes('bike')) return '/rental-photos/bike.png'
  if (group.includes('vehicle')) return '/rental-photos/bike.png'
  if (group.includes('bus')) return '/rental-photos/bus.png'

  return '/rental-photos/projector.png'
}
