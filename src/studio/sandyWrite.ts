// One-off writing jobs for Sandy's AI (captions, pitches). Returns plain text, or null if the brain is unreachable.
import { supabase } from '../supabase'

export async function sandyWrite(task: string, context: unknown = {}): Promise<string | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.functions.invoke('sandy-chat', {
      body: {
        messages: [{ role: 'user', content: `${task}\n\nReply with ONLY the text itself. No intro, no quotes, no options, no tool calls.` }],
        context: { today: new Date().toISOString().slice(0, 10), ...((context as object) ?? {}) },
      },
    })
    if (error) return null
    const text = String(data?.reply ?? '').trim().replace(/^["“]|["”]$/g, '')
    return text || null
  } catch {
    return null
  }
}
