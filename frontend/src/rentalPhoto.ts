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

export function rentalPhoto(title: string, category: string) {
  console.log('TITLE=', title)
  console.log('CATEGORY=', category)

  const name = title.toLowerCase()
  const match = photos.find(([keyword]) => name.includes(keyword))

  if (match) {
    console.log('MATCH=', match[1])
    return `/rental-photos/${match[1]}.png`
  }

  const group = category.toLowerCase()

  console.log('GROUP=', group)

  if (group.includes('bike')) return '/rental-photos/bike.png'
  if (group.includes('vehicle')) return '/rental-photos/bike.png'
  if (group.includes('bus')) return '/rental-photos/bus.png'

  return '/rental-photos/projector.png'
}