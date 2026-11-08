// ---------------------------------------------------------------------------
// Everything on your public site is editable here. Change the text, add your
// Instagram, and drop real photos into  public/portfolio/  then point the
// gallery `src` fields at them (e.g. src: '/portfolio/concert-1.jpg').
// ---------------------------------------------------------------------------

export interface GalleryItem {
  src?: string // e.g. '/portfolio/live-1.jpg' — leave empty to show a placeholder tile
  label: string
  variant: 0 | 1 | 2 | 3
  tall?: boolean // spans 2 rows (good for portrait shots)
  wide?: boolean // spans 2 columns (good for landscape shots)
}

export interface Service {
  title: string
  desc: string
}

export const portfolio = {
  wordmark: 'CMK CAPTURES',
  name: 'CMK Captures',
  tagline: 'Nightlife & event photography',
  location: 'London',

  intro:
    "I'm a London-based photographer who chases light in dark rooms — live music, portraits, and the moments most cameras miss. Shot on Sony, lit when it counts, always after the feeling over the pose.",

  // Where inquiries are sent + where people find you.
  email: 'cmkcaptures@gmail.com',
  instagram: 'https://instagram.com/cmk._7',
  instagramHandle: '@cmk._7',

  workedWith: ['Hurricane Events', 'Afro Indies', 'Franglish'],

  services: [
    { title: 'Live & Concerts', desc: 'Gigs, sets and stage energy captured in low light.' },
    { title: 'Portraits', desc: 'Editorial and natural-light portraits with real presence.' },
    { title: 'Events & Nights', desc: 'Parties, launches and nights out, documented properly.' },
  ] as Service[],

  // Your real work. Add more by dropping files in public/portfolio/ and adding a line here.
  gallery: [
    { src: '/portfolio/portrait-blonde.jpg', label: 'Nightlife', variant: 0, tall: true },
    { src: '/portfolio/crowd-wide.jpg', label: 'Events', variant: 1, wide: true },
    { src: '/portfolio/portrait-blue.jpg', label: 'Portraits', variant: 2, tall: true },
    { src: '/portfolio/live-spotlight.jpg', label: 'Live', variant: 3, tall: true },
    { src: '/portfolio/event-duo.jpg', label: 'Events', variant: 0, tall: true },
    { src: '/portfolio/event-hurricane.jpg', label: 'Nightlife', variant: 1, tall: true },
    { src: '/portfolio/event-trio.jpg', label: 'Events', variant: 2, tall: true },
    { src: '/portfolio/street-london.jpg', label: 'Portraits', variant: 3, tall: true },
  ] as GalleryItem[],

  // Options shown in the booking form's "what kind of shoot" dropdown.
  shootTypes: ['Concert / live', 'Portrait', 'Event', 'Other'],

  // Your packages. Prices are STARTING POINTS — set them to what you're happy to charge.
  packages: [
    {
      name: 'The Drop',
      price: 'from £150',
      best: 'Smaller nights & pop-ups',
      popular: false,
      features: ['Up to 2 hours coverage', '25+ edited photos', '48-hour delivery', 'IG-ready crops'],
    },
    {
      name: 'The Main Event',
      price: 'from £280',
      best: 'A full night, done properly',
      popular: true,
      features: [
        'Up to 4 hours coverage',
        '50+ edited photos',
        'Next-day delivery',
        'Full-res + IG-ready crops',
        'Venue & guest tagging',
      ],
    },
    {
      name: 'The Headliner',
      price: 'from £450',
      best: 'Big nights + content',
      popular: false,
      features: [
        'Full event coverage',
        'All edited photos',
        '3–5 video clips for reels',
        'Priority same-day delivery',
        'Full-res + IG-ready crops',
      ],
    },
  ] as Package[],

  // Shown under the packages.
  packagesNote: 'Tours, residencies & series — custom quotes, just ask.',
}

export interface Package {
  name: string
  price: string
  best: string
  popular: boolean
  features: string[]
}

export const GALLERY_GRADIENTS = [
  'linear-gradient(135deg,#3B2F21 0%,#211A12 70%)',
  'linear-gradient(135deg,#33281C 0%,#1D1710 70%)',
  'linear-gradient(135deg,#2E2A20 0%,#1A1712 70%)',
  'linear-gradient(135deg,#282217 0%,#171310 70%)',
]
