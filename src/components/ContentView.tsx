import { useState } from 'react'
import type { ShootType, Tone, CaptionDetails } from '../captions'
import {
  SHOOT_TYPES,
  TONES,
  generateCaptions,
  buildHashtags,
  POST_TIPS,
} from '../captions'

export default function ContentView() {
  const [shootType, setShootType] = useState<ShootType>('live')
  const [tone, setTone] = useState<Tone>('hyped')
  const [details, setDetails] = useState<CaptionDetails>({ subject: '', venue: '', city: 'London' })
  const [addCta, setAddCta] = useState(true)
  const [captions, setCaptions] = useState<string[]>([])
  const [hashtags, setHashtags] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  function updateDetail<K extends keyof CaptionDetails>(key: K, value: string) {
    setDetails((d) => ({ ...d, [key]: value }))
  }

  function generate() {
    setCaptions(generateCaptions(tone, shootType, details, 3, addCta))
    setHashtags(buildHashtags(shootType))
  }

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id)
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600)
    })
  }

  return (
    <div className="content-view">
      <div className="content-form">
        <div className="field-grid">
          <div className="field">
            <label className="field-label">Shoot type</label>
            <select value={shootType} onChange={(e) => setShootType(e.target.value as ShootType)}>
              {SHOOT_TYPES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Vibe</label>
            <select value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
              {TONES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field-grid">
          <div className="field">
            <label className="field-label">Artist / subject (optional)</label>
            <input
              value={details.subject}
              onChange={(e) => updateDetail('subject', e.target.value)}
              placeholder="e.g. Franglish"
            />
          </div>
          <div className="field">
            <label className="field-label">Venue (optional)</label>
            <input
              value={details.venue}
              onChange={(e) => updateDetail('venue', e.target.value)}
              placeholder="e.g. O2 Academy Brixton"
            />
          </div>
        </div>

        <div className="field-grid">
          <div className="field">
            <label className="field-label">City</label>
            <input
              value={details.city}
              onChange={(e) => updateDetail('city', e.target.value)}
              placeholder="London"
            />
          </div>
          <div
            className={`delivered-toggle${addCta ? ' on' : ''}`}
            onClick={() => setAddCta((v) => !v)}
          >
            <span className={`checkbox-box${addCta ? ' checked' : ''}`} />
            <span className="checkbox-label">Add “link in bio” booking line</span>
          </div>
        </div>

        <button className="btn-brass" onClick={generate}>
          {captions.length ? 'Shuffle captions' : 'Generate captions'}
        </button>
      </div>

      {captions.length > 0 && (
        <div className="content-results">
          <div className="results-block">
            <span className="results-label">Caption options</span>
            {captions.map((cap, i) => (
              <div className="caption-card" key={i}>
                <p className="caption-text">{cap}</p>
                <button className="copy-chip" onClick={() => copy(cap, `cap-${i}`)}>
                  {copied === `cap-${i}` ? 'Copied' : 'Copy'}
                </button>
              </div>
            ))}
          </div>

          <div className="results-block">
            <span className="results-label">Hashtags</span>
            <div className="hashtag-box">
              <p className="hashtag-text">{hashtags}</p>
              <button className="copy-chip" onClick={() => copy(hashtags, 'tags')}>
                {copied === 'tags' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="results-block">
            <span className="results-label">Posting tips</span>
            <ul className="tips-list">
              {POST_TIPS.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
