import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const SENDER = 'cmkcaptures@gmail.com'
const SITE = 'https://cmkcaptures.github.io'

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

Deno.serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const mail = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: SENDER, pass: Deno.env.get('GMAIL_APP_PASSWORD')! },
  })

  const { data: due, error } = await db
    .from('galleries')
    .select('id,token,title,client_email')
    .lte('send_at', new Date().toISOString())
    .is('sent_at', null)
    .is('send_error', null)
    .not('client_email', 'is', null)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  let sent = 0
  for (const g of due ?? []) {
    const { count } = await db
      .from('gallery_photos')
      .select('id', { count: 'exact', head: true })
      .eq('gallery_id', g.id)
    if (!count) continue

    // Claim the row first so overlapping runs can't email a client twice.
    const { data: claimed } = await db
      .from('galleries')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', g.id)
      .is('sent_at', null)
      .select('id')
    if (!claimed?.length) continue

    const link = `${SITE}/g/${g.token}`
    try {
      await mail.sendMail({
        from: `CMK Captures <${SENDER}>`,
        to: g.client_email,
        subject: 'Your photos are ready',
        text: `Your photos are ready to view and download:\n\n${link}\n\nHope you love them!\nCMK Captures`,
        html: `<p>Your photos are ready to view and download:</p><p><a href="${escapeHtml(link)}">${escapeHtml(g.title || 'View your gallery')}</a></p><p>Hope you love them!<br>CMK Captures</p>`,
      })
      sent += 1
    } catch (e) {
      await db
        .from('galleries')
        .update({ sent_at: null, send_error: (e as Error).message })
        .eq('id', g.id)
    }
  }
  return Response.json({ sent })
})
