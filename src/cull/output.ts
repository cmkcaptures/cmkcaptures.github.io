// Writes Lightroom-readable star ratings (.xmp sidecars) and copies keepers into a Picks folder.
import type { Shot, Verdict } from './decide'
import type { StyleProfile } from './style'
import { styleFor } from './style'

const RATING: Record<Verdict, number> = { pick: 3, maybe: 1, reject: -1 }

function xmp(rating: number, label: string, edit?: { attrs: string; inner: string }): string {
  return `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="PhotoFlow Cull">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
    xmp:Rating="${rating}"
    xmp:Label="${label}"${edit ? `
    ${edit.attrs}>
${edit.inner}
  </rdf:Description>` : '/>'}
 </rdf:RDF>
</x:xmpmeta>
`
}

async function exists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name)
    return true
  } catch {
    return false
  }
}

async function write(dir: FileSystemDirectoryHandle, name: string, data: Blob | string) {
  const handle = await dir.getFileHandle(name, { create: true })
  const w = await handle.createWritable()
  await w.write(data)
  await w.close()
}

export interface OutputReport {
  sidecars: number
  skipped: number
  copied: number
}

export async function writeResults(
  dir: FileSystemDirectoryHandle,
  shots: Shot[],
  opts: { sidecars: boolean; copyPicks: boolean; includeMaybes: boolean; style?: StyleProfile | null },
  progress: (text: string) => void,
): Promise<OutputReport> {
  const report: OutputReport = { sidecars: 0, skipped: 0, copied: 0 }
  const final = (s: Shot) => s.mine ?? s.verdict

  if (opts.sidecars) {
    for (const [i, s] of shots.entries()) {
      progress(`Writing Lightroom ratings ${i + 1}/${shots.length}`)
      const name = s.name.replace(/\.[^.]+$/, '.xmp')
      if (await exists(dir, name)) {
        report.skipped++
        continue
      }
      const v = final(s)
      const edit = opts.style && v !== 'reject' ? styleFor(opts.style, s.features.bright) : undefined
      await write(dir, name, xmp(RATING[v], v === 'pick' ? 'Green' : v === 'maybe' ? 'Yellow' : '', edit))
      report.sidecars++
    }
  }

  if (opts.copyPicks) {
    const picks = await dir.getDirectoryHandle('Picks', { create: true })
    const keep = shots.filter((s) => final(s) === 'pick' || (opts.includeMaybes && final(s) === 'maybe'))
    for (const [i, s] of keep.entries()) {
      progress(`Copying keeper ${i + 1}/${keep.length}`)
      if (await exists(picks, s.name)) continue
      const file = await (await dir.getFileHandle(s.name)).getFile()
      await write(picks, s.name, file)
      const side = s.name.replace(/\.[^.]+$/, '.xmp')
      if (await exists(dir, side)) await write(picks, side, await (await dir.getFileHandle(side)).getFile())
      report.copied++
    }
  }
  return report
}
