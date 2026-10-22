/** Everything the scroll drives in the 3D scene. */
export interface SceneValues {
  /** Orb centre as a fraction of the half-width / half-height of the view. */
  x: number
  y: number
  /** Orb size; 1 fills a little over half the screen height. */
  s: number
  /** Fold depth multiplier. */
  amp: number
  /** 0 = orange-violet, 1 = iridescent. */
  palette: number
  /** Points re-forming into the cap (0..1). */
  toCap: number
  /** Solid cap fading in over the points (0..1). */
  solid: number
  explode: number
  cone: number
  /** Points re-forming into the wordmark (0..1). */
  toWord: number
  /** Dims the orb behind text-heavy sections. */
  dim: number
  figure: number
  ground: number
  /** 0 = daylight, 1 = night (the scene darkens for the light figure). */
  night: number
}

interface Key {
  sel: string
  /** Point in the section (0 top, 1 bottom) that sits at the middle of the screen at this key. */
  at: number
  d: Partial<SceneValues>
  /** Overrides for portrait / phone screens. */
  m?: Partial<SceneValues>
}

const START: SceneValues = {
  x: 0.27, y: 0.02, s: 1, amp: 1, palette: 0, toCap: 0, solid: 0, explode: 0, cone: 0,
  toWord: 0, dim: 0, figure: 0, ground: 1, night: 0,
}

const KEYS: Key[] = [
  { sel: '#top', at: 0.5, d: {}, m: { x: 0, y: 0.42, s: 0.66 } },
  { sel: '#why', at: 0.22, d: { x: 0, y: 0, s: 1.2, amp: 1.3, dim: 0.45, ground: 0.7 }, m: { s: 0.9 } },
  { sel: '#why', at: 0.55, d: { palette: 1, s: 1.28 }, m: { s: 0.95 } },
  { sel: '#why', at: 0.88, d: { palette: 0, s: 1.1 }, m: { s: 0.85 } },
  { sel: '#cap', at: 0.1, d: { x: 0.24, y: 0, s: 0.92, amp: 0.45, dim: 0, toCap: 1, ground: 0.5 }, m: { x: 0, y: 0.3, s: 0.62 } },
  { sel: '#cap', at: 0.3, d: { solid: 1 } },
  { sel: '#cap', at: 0.72, d: { explode: 1, cone: 1 } },
  { sel: '#cap', at: 0.86, d: {} },
  { sel: '#cap', at: 0.98, d: { solid: 0, explode: 0, cone: 0 } },
  { sel: '#work', at: 0.35, d: { x: -0.3, y: 0, s: 0.72, amp: 1, toCap: 0, dim: 0.35, ground: 0.85 }, m: { x: 0, y: -0.1, s: 0.6, dim: 0.75 } },
  { sel: '#day', at: 0.5, d: { x: 0.3, y: 0.08, s: 0.62, amp: 0.85, dim: 0.55, ground: 0.6 }, m: { x: 0, y: 0, dim: 0.8 } },
  { sel: '#day', at: 0.62, d: {} },
  // Night falls for the Promises section, where the figure of light appears.
  { sel: '#promises', at: 0, d: { x: 0.3, s: 0.5, dim: 0.95, figure: 1, ground: 0, night: 1 }, m: { x: 0, dim: 0.97 } },
  { sel: '#promises', at: 0.85, d: {} },
  { sel: '#take-part', at: 0, d: { x: 0, y: 0.06, s: 0.9, amp: 1.2, dim: 0.62, figure: 0, ground: 0.85, night: 0 }, m: { s: 0.7, dim: 0.8 } },
  { sel: '#take-part', at: 0.45, d: {} },
  { sel: '.footer', at: 0.42, d: { x: 0, y: 0.18, amp: 0.5, dim: 0, toWord: 1, ground: 1 }, m: { y: 0.14 } },
]

const FIELDS = Object.keys(START) as (keyof SceneValues)[]

/** Maps scroll position to scene values by easing between keyframes pinned to sections. */
export class Choreography {
  private readonly desktop: SceneValues[] = []
  private readonly mobile: SceneValues[] = []
  private positions: number[] = []

  constructor() {
    let d = { ...START }
    let m = { ...START }
    for (const key of KEYS) {
      d = { ...d, ...key.d }
      m = { ...m, ...key.d, ...key.m }
      this.desktop.push(d)
      this.mobile.push(m)
    }
  }

  values(): SceneValues {
    return { ...this.desktop[0] }
  }

  /** Recompute where each keyframe sits on the page. Call after layout changes. */
  measure(aspect: number): void {
    const vh = window.innerHeight
    const max = Math.max(0, document.documentElement.scrollHeight - vh)
    let previous = 0
    this.positions = KEYS.map((key, i) => {
      const el = document.querySelector<HTMLElement>(key.sel)
      if (!el || i === 0) return 0
      const rect = el.getBoundingClientRect()
      const p = Math.min(Math.max(rect.top + window.scrollY + key.at * rect.height - vh / 2, previous), max)
      previous = p
      return p
    })
    // The wordmark is wide: shrink it on narrow screens.
    const wordScale = Math.min(1, Math.max(0.38, aspect * 0.9))
    this.desktop[this.desktop.length - 1].s = wordScale
    this.mobile[this.mobile.length - 1].s = wordScale
  }

  sample(scrollY: number, phone: boolean, out: SceneValues): void {
    const values = phone ? this.mobile : this.desktop
    const pos = this.positions
    let i = 0
    while (i < pos.length - 1 && scrollY >= pos[i + 1]) i++
    if (i >= pos.length - 1) {
      Object.assign(out, values[values.length - 1])
      return
    }
    const span = pos[i + 1] - pos[i]
    const t = span > 0 ? Math.min(Math.max((scrollY - pos[i]) / span, 0), 1) : 1
    const e = t * t * (3 - 2 * t)
    const a = values[i]
    const b = values[i + 1]
    for (const f of FIELDS) out[f] = a[f] + (b[f] - a[f]) * e
  }
}
