// Free, instant caption + hashtag generator. No API, no cost — templated but
// varied, tailored to shoot type and vibe. Upgradeable to Claude later.

export type ShootType = 'live' | 'portrait' | 'london' | 'event' | 'other'
export type Tone = 'hyped' | 'moody' | 'minimal' | 'story'

export const SHOOT_TYPES: { key: ShootType; label: string }[] = [
  { key: 'live', label: 'Live / Concert' },
  { key: 'portrait', label: 'Portrait' },
  { key: 'london', label: 'Street / London' },
  { key: 'event', label: 'Event / Night' },
  { key: 'other', label: 'Other' },
]

export const TONES: { key: Tone; label: string }[] = [
  { key: 'hyped', label: 'Hyped' },
  { key: 'moody', label: 'Moody' },
  { key: 'minimal', label: 'Minimal' },
  { key: 'story', label: 'Storytelling' },
]

export interface CaptionDetails {
  subject: string // artist / person
  venue: string
  city: string
}

const NOUN: Record<ShootType, string> = {
  live: 'set',
  portrait: 'session',
  london: 'day',
  event: 'night',
  other: 'shoot',
}

type Tmpl = (d: CaptionDetails, noun: string) => string

const TEMPLATES: Record<Tone, Tmpl[]> = {
  hyped: [
    (_d, n) => `Still buzzing off that ${n}. ⚡`,
    (d) => `${d.subject || 'This energy'} — unmatched. 🔥`,
    (d) => `Turn it up. 🔊${d.venue ? ` ${d.venue}.` : ''}`,
    (d) => `One for the books.${d.venue ? ` ${d.venue}` : ''} 🙌`,
    (d) => `They came, they showed up.${d.subject ? ` ${d.subject} 🎤` : ' 🎤'}`,
  ],
  moody: [
    () => `Chasing light in the dark.`,
    (d) => `${d.city || 'London'} after hours.`,
    () => `Some frames just feel like a mood.`,
    (d) => `Grain, shadow, and a bit of magic.${d.venue ? ` ${d.venue}.` : ''}`,
    () => `Low light is where I live.`,
  ],
  minimal: [
    (d) => [d.subject, d.venue, d.city].filter(Boolean).join(' · ') || 'Untitled.',
    (d) => `${d.city || 'London'}.`,
    () => `No caption needed.`,
    (d) => `${d.subject || 'Frame'} — captured.`,
  ],
  story: [
    (_d, n) => `There's a moment mid-${n} where the whole room locks in. This was it.`,
    (d) => `Booked to shoot${d.subject ? ` ${d.subject}` : ''} and left with frames I can't stop looking at.`,
    (d) => `Low light, high stakes — my favourite kind of shoot.${d.venue ? ` ${d.venue}.` : ''}`,
    () => `Every night tells a story. Grateful I get to capture them.`,
  ],
}

const CTA = '\n\nBooking London shoots — link in bio 📩'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function generateCaptions(
  tone: Tone,
  shootType: ShootType,
  details: CaptionDetails,
  count = 3,
  addCta = false,
): string[] {
  const noun = NOUN[shootType]
  const picks = shuffle(TEMPLATES[tone]).slice(0, count)
  return picks.map((t) => {
    let cap = t(details, noun).replace(/\s+/g, ' ').trim()
    if (addCta) cap += CTA
    return cap
  })
}

const HASH: Record<string, string[]> = {
  live: [
    '#concertphotography',
    '#livemusic',
    '#musicphotography',
    '#gigphotography',
    '#stagephotography',
    '#concertphotographer',
    '#livemusicphotography',
    '#bandphotography',
  ],
  portrait: [
    '#portraitphotography',
    '#portraitphotographer',
    '#portraitmood',
    '#editorialportrait',
    '#naturallightphotography',
    '#portraitsociety',
  ],
  london: [
    '#londonphotographer',
    '#streetphotographylondon',
    '#londonlife',
    '#shootlondon',
    '#streetstyle',
  ],
  event: ['#eventphotography', '#eventphotographer', '#nightlifephotography', '#partyphotography'],
  other: ['#photographer', '#photoshoot'],
}

const GENERAL = [
  '#photography',
  '#sonyalpha',
  '#lowlightphotography',
  '#photooftheday',
  '#capturethemoment',
  '#photographylovers',
]

export function buildHashtags(shootType: ShootType): string {
  const category = HASH[shootType] ?? HASH.other
  const all = [...category, ...GENERAL, '#london', '#cmkcaptures']
  const deduped = Array.from(new Set(all))
  return deduped.join(' ')
}

export const POST_TIPS: string[] = [
  'Post between 6–9pm — that’s when people are actually scrolling.',
  'Put the hashtags in the first comment, not the caption — keeps it clean.',
  'Tag the artist and the venue. If they reshare, their whole audience sees your work.',
  'End with a soft CTA so people know they can book you: “London shoots — link in bio.”',
]
