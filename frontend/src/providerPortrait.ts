// Illustrative portraits are assigned only to the named demo providers.
const demoPortraits: Record<string, string> = {
  'mira joshi': '/help-portraits/mira-joshi.jpg',
  'meera joshi': '/help-portraits/mira-joshi.jpg',
  'meera zoshi': '/help-portraits/mira-joshi.jpg',
  'dev mehta': '/help-portraits/dev-mehta.jpg',
  'kavya iyer': '/help-portraits/kavya-iyer.jpg',
  'arjun das': '/help-portraits/arjun-das.jpg',
  'kabir sen': '/help-portraits/kabir-sen.jpg',
  'tatya': '/help-portraits/tatya.jpg',
  'neha patel': '/help-portraits/neha-patel.jpg',
  'nia patel': '/help-portraits/neha-patel.jpg'
}

export function providerPortrait(name: string): string | null {
  return demoPortraits[name.trim().toLowerCase()] ?? null
}
