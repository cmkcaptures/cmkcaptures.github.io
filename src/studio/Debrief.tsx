// After a shoot: three quick questions that teach Sandy (how it went, what you got paid, lessons).
import { useState } from 'react'
import { supabase } from '../supabase'

const VIBES = ['😖', '😕', '🙂', '😄', '🔥']

export default function Debrief({ id, name, date, price, onDone }: { id: string; name: string; date: string; price: string; onDone: (paid: string) => void }) {
  const [vibe, setVibe] = useState(3)
  const [paid, setPaid] = useState(price.replace(/[^0-9.]/g, ''))
  const [again, setAgain] = useState<boolean | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const body = [
      `${name} (${date || 'shoot'}): rated it ${vibe + 1}/5.`,
      paid ? `Paid £${paid}.` : '',
      again === null ? '' : again ? 'Would work with them again.' : 'Would NOT rush to work with them again.',
      notes.trim() ? `Lessons/notes: ${notes.trim()}` : '',
    ]
      .filter(Boolean)
      .join(' ')
    await supabase?.from('sandy_knowledge').insert({ topic: 'contacts', title: `Debrief · ${name} · ${id}`, body })
    setSaving(false)
    onDone(paid ? `£${paid}` : '')
  }

  return (
    <div className="db">
      <span className="db-q">How did it go?</span>
      <div className="db-vibes">
        {VIBES.map((v, i) => (
          <button key={v} className={vibe === i ? 'on' : ''} onClick={() => setVibe(i)} aria-label={`${i + 1} out of 5`}>
            {v}
          </button>
        ))}
      </div>
      <span className="db-q">What did you get paid?</span>
      <label className="db-money">
        £<input inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
      </label>
      <span className="db-q">Work with them again?</span>
      <div className="db-again">
        <button className={again === true ? 'on' : ''} onClick={() => setAgain(true)}>
          Yes
        </button>
        <button className={again === false ? 'on' : ''} onClick={() => setAgain(false)}>
          Not really
        </button>
      </div>
      <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to remember? Venue light, who to tag, what to do differently…" />
      <button className="db-save" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Teach Sandy'}
      </button>
    </div>
  )
}
