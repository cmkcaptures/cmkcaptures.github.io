// Scores one photo: subject sharpness (best region, not the whole frame), exposure, contrast, colour, and a look-alike hash.
export interface Features {
  sharp: number // sharpness of the sharpest region (focus on the subject)
  sharpMid: number // median region sharpness (whole-frame softness)
  bright: number // 0-255 mean
  clipHi: number // fraction blown out
  clipLo: number // fraction crushed
  contrast: number
  colour: number
  hash: string // 64-bit difference hash (hex) for spotting near-duplicates
}

const W = 384
const GRID = 6

export async function analyse(blob: Blob, orientation = 1): Promise<{ features: Features; thumb: string }> {
  const turned = orientation === 6 || orientation === 8
  const src = await createImageBitmap(blob, { imageOrientation: 'none' } as ImageBitmapOptions)
  const sw = turned ? src.height : src.width
  const sh = turned ? src.width : src.height
  const h = Math.max(8, Math.round((sh / sw) * W))
  const canvas = new OffscreenCanvas(W, h)
  const ctx = canvas.getContext('2d')!
  ctx.save()
  ctx.translate(W / 2, h / 2)
  if (orientation === 6) ctx.rotate(Math.PI / 2)
  else if (orientation === 8) ctx.rotate(-Math.PI / 2)
  else if (orientation === 3) ctx.rotate(Math.PI)
  const dw = turned ? h : W
  const dh = turned ? W : h
  ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh)
  ctx.restore()
  src.close()
  const thumb = URL.createObjectURL(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 }))
  const { data } = ctx.getImageData(0, 0, W, h)

  const n = W * h
  const lum = new Float32Array(n)
  let sum = 0
  let hi = 0
  let lo = 0
  let sat = 0
  for (let i = 0; i < n; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const y = 0.299 * r + 0.587 * g + 0.114 * b
    lum[i] = y
    sum += y
    if (y > 250) hi++
    if (y < 6) lo++
    sat += Math.max(r, g, b) - Math.min(r, g, b)
  }
  const mean = sum / n
  let v = 0
  for (let i = 0; i < n; i++) v += (lum[i] - mean) ** 2

  // Laplacian energy per tile; the sharpest tiles tell us whether the subject is in focus.
  const tw = Math.floor(W / GRID)
  const th = Math.floor(h / GRID)
  const tiles: number[] = []
  for (let ty = 0; ty < GRID; ty++)
    for (let tx = 0; tx < GRID; tx++) {
      let e = 0
      let c = 0
      for (let y = Math.max(1, ty * th); y < Math.min(h - 1, (ty + 1) * th); y++)
        for (let x = Math.max(1, tx * tw); x < Math.min(W - 1, (tx + 1) * tw); x++) {
          const i = y * W + x
          const lap = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - W] - lum[i + W]
          e += lap * lap
          c++
        }
      tiles.push(c ? e / c : 0)
    }
  tiles.sort((a, b) => b - a)

  // dHash on a 9x8 thumbnail
  const hc = new OffscreenCanvas(9, 8)
  const hctx = hc.getContext('2d')!
  hctx.drawImage(canvas, 0, 0, 9, 8)
  const hd = hctx.getImageData(0, 0, 9, 8).data
  let bits = ''
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const p = (y * 9 + x) * 4
      bits += hd[p] + hd[p + 1] + hd[p + 2] > hd[p + 4] + hd[p + 5] + hd[p + 6] ? '1' : '0'
    }

  return {
    thumb,
    features: {
      sharp: Math.sqrt((tiles[0] + tiles[1] + tiles[2]) / 3),
      sharpMid: Math.sqrt(tiles[Math.floor(tiles.length / 2)]),
      bright: mean,
      clipHi: hi / n,
      clipLo: lo / n,
      contrast: Math.sqrt(v / n),
      colour: sat / n,
      hash: BigInt(`0b${bits}`).toString(16),
    },
  }
}

export function hamming(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
  let c = 0
  while (x) {
    c += Number(x & 1n)
    x >>= 1n
  }
  return c
}
