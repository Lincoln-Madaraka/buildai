export interface Tier {
  name: 'high' | 'mid' | 'low'
  /** Orb points per cube-face edge: 6 * grid^2 points in total. */
  grid: number
  dprCap: number
  figure: number
  terrain: [columns: number, rows: number]
  octaves: number
  dust: number
}

export function pickTier(): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = nav.hardwareConcurrency || 4
  const memory = nav.deviceMemory ?? 8
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = window.innerWidth < 820

  if (coarse || narrow || cores <= 4 || memory <= 4) {
    return { name: 'low', grid: 60, dprCap: 1.5, figure: 6000, terrain: [150, 80], octaves: 3, dust: 500 }
  }
  if (cores >= 8 && window.innerWidth >= 1280) {
    return { name: 'high', grid: 92, dprCap: 1.75, figure: 14000, terrain: [260, 140], octaves: 4, dust: 1400 }
  }
  return { name: 'mid', grid: 76, dprCap: 1.5, figure: 10000, terrain: [200, 110], octaves: 4, dust: 900 }
}
