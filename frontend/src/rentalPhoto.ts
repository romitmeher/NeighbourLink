const photos = [
  ['picnic table', 'picnic-table'],
  ['vacuum', 'vacuum'],
  ['camping chair', 'camping-chairs'],
  ['speaker', 'speaker'],
  ['ladder', 'ladder'],
  ['drill', 'drill'],
  ['tent', 'tent'],
  ['projector', 'projector']
] as const

export function rentalPhoto(title: string, category: string) {
  const name = title.toLowerCase()
  const match = photos.find(([keyword]) => name.includes(keyword))
  if (match) return `/rental-photos/${match[1]}.png`

  const group = category.toLowerCase()
  if (group.includes('camp')) return '/rental-photos/tent.png'
  if (group.includes('party') || group.includes('projector')) return '/rental-photos/projector.png'
  if (group.includes('tool')) return '/rental-photos/drill.png'
  return '/rental-photos/picnic-table.png'
}
