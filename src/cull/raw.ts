// Pulls the embedded full-size JPEG preview and capture time out of a RAW file (Sony ARW and other TIFF-based RAWs).
// Reads only the bytes it needs, so a 25MB ARW costs a few MB of reading.

export interface RawInfo {
  preview: Blob | null
  takenAt: number // ms since epoch, with sub-seconds when the camera writes them
  orientation: number // EXIF orientation: 1 normal, 6 = rotate 90° clockwise, 8 = 90° anticlockwise, 3 = 180°
}

const HEAD = 512 * 1024

export async function readRaw(file: File): Promise<RawInfo> {
  if (/\.(jpe?g)$/i.test(file.name)) return { preview: file, takenAt: file.lastModified, orientation: 1 }
  const head = new DataView(await file.slice(0, HEAD).arrayBuffer())
  const order = head.getUint16(0)
  if (order !== 0x4949 && order !== 0x4d4d) return { preview: await scanForJpeg(file), takenAt: file.lastModified, orientation: 1 }
  const little = order === 0x4949
  const u16 = (o: number) => head.getUint16(o, little)
  const u32 = (o: number) => head.getUint32(o, little)
  const fits = (o: number, n: number) => o >= 0 && o + n <= head.byteLength

  const jpegs: { off: number; len: number }[] = []
  let exifIfd = 0
  let orientation = 1
  const seen = new Set<number>()

  const walk = (ifd: number, depth: number) => {
    if (!ifd || !fits(ifd, 2) || seen.has(ifd) || depth > 4) return
    seen.add(ifd)
    const count = u16(ifd)
    let off = 0
    let len = 0
    const subs: number[] = []
    for (let i = 0; i < count; i++) {
      const e = ifd + 2 + i * 12
      if (!fits(e, 12)) break
      const tag = u16(e)
      const type = u16(e + 2)
      const n = u32(e + 4)
      const val = type === 3 && n === 1 ? u16(e + 8) : u32(e + 8)
      if (tag === 0x0201) off = val
      else if (tag === 0x0202) len = val
      else if (tag === 0x8769) exifIfd = val
      else if (tag === 0x0112 && depth === 0 && orientation === 1) orientation = val
      else if (tag === 0x014a) {
        if (n === 1) subs.push(val)
        else for (let k = 0; k < n && fits(val + k * 4, 4); k++) subs.push(u32(val + k * 4))
      }
    }
    if (off && len) jpegs.push({ off, len })
    subs.forEach((s) => walk(s, depth + 1))
    const nextAt = ifd + 2 + count * 12
    if (fits(nextAt, 4)) walk(u32(nextAt), depth + 1)
  }
  walk(u32(4), 0)

  let takenAt = file.lastModified
  if (exifIfd && fits(exifIfd, 2)) {
    const count = u16(exifIfd)
    let stamp = ''
    let sub = ''
    for (let i = 0; i < count; i++) {
      const e = exifIfd + 2 + i * 12
      if (!fits(e, 12)) break
      const tag = u16(e)
      const n = u32(e + 4)
      const ptr = n > 4 ? u32(e + 8) : e + 8
      const str = () => {
        let s = ''
        for (let k = 0; k < n - 1 && fits(ptr + k, 1); k++) s += String.fromCharCode(head.getUint8(ptr + k))
        return s.trim()
      }
      if (tag === 0x9003) stamp = str()
      if (tag === 0x9291) sub = str()
    }
    const m = stamp.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
    if (m) takenAt = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() + (sub ? Number(`0.${sub}`) * 1000 : 0)
  }

  const best = jpegs.filter((j) => j.off + j.len <= file.size).sort((a, b) => b.len - a.len)[0]
  const preview = best && best.len > 50000 ? file.slice(best.off, best.off + best.len, 'image/jpeg') : await scanForJpeg(file)
  return { preview, takenAt, orientation }
}

/** Fallback: find the biggest JPEG inside the first few MB. */
async function scanForJpeg(file: File): Promise<Blob | null> {
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 8 * 1024 * 1024)).arrayBuffer())
  let best: [number, number] | null = null
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      for (let j = i + 2; j < bytes.length - 1; j++) {
        if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
          if (!best || j - i > best[1] - best[0]) best = [i, j + 2]
          i = j
          break
        }
      }
    }
  }
  return best && best[1] - best[0] > 50000 ? file.slice(best[0], best[1], 'image/jpeg') : null
}
