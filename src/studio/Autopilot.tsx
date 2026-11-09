// Growth autopilot: Sandy builds the week (pitches with DMs, posts, follow-ups, rebooks). You approve once; it becomes dated reminders.
import { useState } from 'react'
import type { Client } from '../types'
import { parseShootDate } from './time'
import type { Lead } from '../growth'
import { addLead, isFollowUpDue, listLeads } from '../growth'
import type { RadarEvent } from './events'
import { fetchEvents } from './events'
import { fitScore } from './EventsList'
import type { Post } from './postsApi'
import { listPosts, updatePost } from './postsApi'
import { addReminder } from './sandyCommands'
import { sandyWrite } from './sandyWrite'
import Portal from './Portal'
import './Autopilot.css'

type Kind = 'pitch' | 'repitch' | 'post' | 'follow' | 'rebook'
interface Task {
  id: string
  kind: Kind
  title: string
  sub: string
  day: string // YYYY-MM-DD it's planned for
  dm?: string | null
  event?: RadarEvent
  lead?: Lead
  post?: Post
  on: boolean
}

const ICON: Record<Kind, string> = { pitch: '✦', repitch: '↻', post: '▣', follow: '✉', rebook: '★' }
const LABEL: Record<Kind, string> = { pitch: 'Pitch', repitch: 'Pitch again', post: 'Post', follow: 'Follow up', rebook: 'Rebook' }
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

function weekDays(): string[] {
  const d = new Date()
  const toMon = (8 - d.getDay()) % 7 || 7 // next Monday (or the one after if today is Monday)
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (d.getDay() === 0 ? 1 : toMon))
  return Array.from({ length: 7 }, (_, i) => iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i)))
}

export default function Autopilot({ clients, onClose }: { clients: Client[]; onClose: () => void }) {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [status, setStatus] = useState('')
  const [done, setDone] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const week = weekDays()

  async function build() {
    setTasks(null)
    setDone('')
    setStatus('Scanning London events…')
    const [events, leads, posts] = await Promise.all([fetchEvents().catch(() => []), listLeads().catch(() => []), listPosts().catch(() => [])])
    const out: Task[] = []
    const pitchDays = [week[0], week[1], week[2], week[3], week[1]]

    // Re-pitch people you've worked with, before new strangers.
    const repeat = clients
      .filter((c) => c.stage === 'paid' || c.stage === 'delivered')
      .filter((c) => {
        const d = parseShootDate(c.shootDate)
        return d && Date.now() - d.getTime() > 18 * 86400000
      })
      .slice(0, 2)
    repeat.forEach((c) => out.push({ id: `re-${c.id}`, kind: 'repitch', title: c.name, sub: `Shot ${c.type || 'a night'} ${c.shootDate}. Time to line up the next one.`, day: pitchDays[out.length], dm: null, on: true }))

    const pitched = new Set(leads.map((l) => l.event_name))
    const picks = events
      .filter((e) => !pitched.has(e.name))
      .map((e) => ({ e, s: fitScore(e).score }))
      .filter(({ e }) => {
        const days = (new Date(`${e.date}T00:00:00`).getTime() - Date.now()) / 86400000
        return days >= 5 && days <= 28
      })
      .sort((a, b) => b.s - a.s)
      .slice(0, 5 - out.length)
    picks.forEach(({ e, s }) => out.push({ id: `ev-${e.id}`, kind: 'pitch', title: e.name, sub: `${e.venue} · ${e.date} · fit ${s}`, day: pitchDays[out.length], dm: null, event: e, on: true }))

    // Posts: schedule what's ready onto Mon / Wed / Fri, keeping anything already planned.
    const planned = posts.filter((p) => p.post_on && week.includes(p.post_on))
    const ready = posts.filter((p) => !p.post_on)
    const slots = [week[0], week[2], week[4]].filter((d) => !planned.some((p) => p.post_on === d))
    ready.slice(0, Math.max(0, 3 - planned.length)).forEach((p, i) => out.push({ id: `po-${p.id}`, kind: 'post', title: p.caption.split('\n')[0].slice(0, 50) || 'Ready post', sub: `${p.photos.length} photo${p.photos.length === 1 ? '' : 's'}`, day: slots[i] ?? week[5], post: p, on: true }))
    if (planned.length + Math.min(ready.length, 3) < 3)
      out.push({ id: 'po-auto', kind: 'post', title: 'Auto-post a gallery', sub: "Not enough ready posts. Run ✦ Auto-post in Posts to fill the week.", day: week[0], on: true })

    leads.filter((l) => isFollowUpDue(l) || (l.follow_up_on && week.includes(l.follow_up_on))).slice(0, 5).forEach((l) => out.push({ id: `fu-${l.id}`, kind: 'follow', title: l.name, sub: l.event_name || 'Follow up on your pitch', day: l.follow_up_on && week.includes(l.follow_up_on) ? l.follow_up_on : week[1], lead: l, on: true }))
    clients.filter((c) => c.rebookOn && c.rebookOn <= week[6]).forEach((c) => out.push({ id: `rb-${c.id}`, kind: 'rebook', title: c.name, sub: 'Your rebook reminder is due', day: c.rebookOn < week[0] ? week[0] : c.rebookOn, on: true }))

    setTasks(out)
    // Write the DMs one by one so the free AI limit isn't hit all at once.
    for (const t of out.filter((t) => t.kind === 'pitch' || t.kind === 'repitch')) {
      setStatus(`Writing DM for ${t.title}…`)
      const prompt =
        t.kind === 'pitch' && t.event
          ? `Short Instagram DM from me (CMK Captures, @cmk._7) to the promoter of "${t.event.name}" at ${t.event.venue} on ${t.event.date}. Info: ${t.event.description.slice(0, 200)}. Mention something specific, offer to shoot it, 48h gallery delivery. 3-4 sentences.`
          : `Short, warm Instagram DM from me (CMK Captures) to ${t.title}, a past client (${t.sub}), asking about their next night and offering to shoot it again. 2-3 sentences.`
      const dm = await sandyWrite(prompt)
      setTasks((list) => list?.map((x) => (x.id === t.id ? { ...x, dm: dm ?? `Hey! Got anything coming up? I'd love to shoot it, gallery back within 48 hours.` } : x)) ?? null)
    }
    setStatus('')
  }

  async function approve() {
    if (!tasks) return
    setStatus('Locking in your week…')
    let n = 0
    for (const t of tasks.filter((t) => t.on)) {
      try {
        if (t.kind === 'pitch' && t.event) {
          await addLead({ name: t.event.venue || t.event.name, kind: 'promoter', handle: '', event_name: t.event.name, event_date: t.event.date })
          await addReminder(`Send pitch DM: ${t.title} (in Sandy → week plan)`, t.day)
        } else if (t.kind === 'repitch') await addReminder(`Pitch ${t.title} again for their next night`, t.day)
        else if (t.kind === 'post' && t.post) await updatePost(t.post.id, { post_on: t.day })
        else if (t.kind === 'post') await addReminder('Run Auto-post to fill this week', t.day)
        else if (t.kind === 'follow') await addReminder(`Follow up with ${t.title}`, t.day)
        else if (t.kind === 'rebook') await addReminder(`Rebook ${t.title}`, t.day)
        n++
      } catch {
        // Skip anything that fails; the rest of the plan still goes in.
      }
    }
    try {
      localStorage.setItem('autopilot.week', JSON.stringify({ week: week[0], tasks: tasks.filter((t) => t.on).map((t) => ({ title: t.title, dm: t.dm, day: t.day, kind: t.kind })) }))
    } catch {
      // DMs stay visible in this session either way.
    }
    setStatus('')
    setDone(`${n} things locked in. Sandy will ping you on the day for each one.`)
  }

  const byDay = week.map((d) => ({ d, list: (tasks ?? []).filter((t) => t.day === d) }))

  return (
    <Portal>
      <div className="ps-drawer-wrap" onClick={onClose}>
        <aside className="ps-drawer apx" onClick={(e) => e.stopPropagation()} aria-label="Week plan">
          <header>
            <h2>✦ Your week</h2>
            <button className="st-ghost" onClick={onClose}>
              Close
            </button>
          </header>
          <p className="ps-hint">
            {new Date(`${week[0]}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {new Date(`${week[6]}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. Untick anything you don't want, then approve.
          </p>

          {tasks === null && !status && (
            <button className="btn-brass apx-go" onClick={build}>
              ✦ Build my week
            </button>
          )}
          {status && (
            <div className="apx-status">
              <div className="ap-orb small" />
              {status}
            </div>
          )}

          {tasks && (
            <div className="apx-days">
              {byDay.map(({ d, list }) => (
                <section key={d} className={`apx-day${list.length ? '' : ' empty'}`}>
                  <h3>{new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</h3>
                  {!list.length && <span className="apx-free">Free</span>}
                  {list.map((t) => (
                    <div key={t.id} className={`apx-task k-${t.kind}${t.on ? '' : ' off'}`}>
                      <label>
                        <input type="checkbox" checked={t.on} onChange={() => setTasks((all) => all!.map((x) => (x.id === t.id ? { ...x, on: !x.on } : x)))} />
                        <i>{ICON[t.kind]}</i>
                        <span>
                          <em>{LABEL[t.kind]}</em>
                          <b>{t.title}</b>
                          <small>{t.sub}</small>
                        </span>
                      </label>
                      {(t.kind === 'pitch' || t.kind === 'repitch') && (
                        <div className="apx-dm">
                          {t.dm === null ? (
                            <small className="st-loading">Writing DM…</small>
                          ) : (
                            <>
                              <button className="apx-link" onClick={() => setOpen(open === t.id ? null : t.id)}>
                                {open === t.id ? 'Hide DM' : 'Show DM'}
                              </button>
                              <button className="apx-link" onClick={() => navigator.clipboard.writeText(t.dm ?? '')}>
                                Copy
                              </button>
                              {open === t.id && <textarea className="ev-draft" rows={5} value={t.dm ?? ''} onChange={(e) => setTasks((all) => all!.map((x) => (x.id === t.id ? { ...x, dm: e.target.value } : x)))} />}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}

          {tasks && !done && (
            <div className="ea-approve">
              <button className="btn-brass" disabled={!!status} onClick={approve}>
                Approve {tasks.filter((t) => t.on).length} things
              </button>
              <button className="st-ghost" disabled={!!status} onClick={build}>
                ↻ Rebuild
              </button>
            </div>
          )}
          {done && <p className="apx-done">✓ {done}</p>}
        </aside>
      </div>
    </Portal>
  )
}
