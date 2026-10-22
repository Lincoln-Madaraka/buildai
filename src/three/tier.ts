export interface Tier {
  name: 'high' | 'mid' | 'low'
  /** Orb points per cube-face edge: 6 * grid^2 points in total. */
  grid: number
  dprCap: number
  figure: number
  dust: number
}

const TIERS: Record<Tier['name'], Tier> = {
  high: { name: 'high', grid: 92, dprCap: 1.75, figure: 14000, dust: 1400 },
  mid: { name: 'mid', grid: 76, dprCap: 1.5, figure: 10000, dust: 900 },
  low: { name: 'low', grid: 60, dprCap: 1.5, figure: 6000, dust: 500 },
}

export function pickTier(): Tier {
  // ?tier=low|mid|high forces a tier, for testing.
  const forced = new URLSearchParams(window.location.search).get('tier')
  if (forced === 'low' || forced === 'mid' || forced === 'high') return TIERS[forced]

  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = nav.hardwareConcurrency || 4
  const memory = nav.deviceMemory ?? 8
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = window.innerWidth < 820

  if (coarse || narrow || cores <= 4 || memory <= 4) return TIERS.low
  if (cores >= 8 && window.innerWidth >= 1280) return TIERS.high
  return TIERS.mid
}
