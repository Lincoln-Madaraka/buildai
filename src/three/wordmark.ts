/**
 * Points on the "build" wordmark, read from the logo's own pixels so the letterforms match the brand.
 * Returns `count` positions centred on the origin, `width` units wide.
 */
export async function sampleWordmark(url: string, count: number, width = 3.2): Promise<Float32Array> {
  const img = new Image()
  img.src = url
  await img.decode()

  const w = img.naturalWidth
  const h = img.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('sampleWordmark: no 2D context')
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, w, h).data

  const xs: number[] = []
  const ys: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 140) {
        xs.push(x)
        ys.push(y)
      }
    }
  }
  if (!xs.length) throw new Error('sampleWordmark: empty image')

  const scale = width / w
  const out = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const k = Math.floor(Math.random() * xs.length)
    out[i * 3] = (xs[k] + Math.random() - w / 2) * scale
    out[i * 3 + 1] = -(ys[k] + Math.random() - h / 2) * scale
    out[i * 3 + 2] = (Math.random() - 0.5) * 0.06
  }
  return out
}
