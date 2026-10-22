import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource/instrument-serif/400-italic.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/sections.css'

import { initLinks } from './ui/links'
import { initMotion, motion } from './ui/motion'
import { initNav } from './ui/nav'
import { initReveal } from './ui/reveal'
import { initScroll } from './ui/scroll'

initMotion()
initLinks()
initScroll()
initNav()
initReveal()

document.querySelectorAll('[data-year]').forEach((el) => {
  el.textContent = String(new Date().getFullYear())
})

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

const useFallback = () => document.documentElement.classList.add('no-webgl')

// The 3D scene loads after first paint, as its own chunk.
if (webglAvailable()) {
  const load = () =>
    import('./three/stage')
      .then((stage) => stage.startStage())
      .catch((error) => {
        console.error(error)
        useFallback()
      })
  if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 500 })
  else setTimeout(load, 100)
} else {
  useFallback()
}

// ?shot=<name> jumps straight to a section; used for screenshots.
const SHOTS: Record<string, [selector: string, at: number]> = {
  hero: ['#top', 0.5],
  why: ['#why', 0.55],
  cap: ['#cap', 0.2],
  explode: ['#cap', 0.8],
  work: ['#work', 0.35],
  day: ['#day', 0.5],
  promises: ['#promises', 0.5],
  'take-part': ['#take-part', 0.45],
  footer: ['.footer', 1],
}

const shot = motion.shot ? SHOTS[motion.shot] : undefined
if (shot) {
  const [selector, at] = shot
  document.fonts.ready.then(() =>
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(selector)
      if (!el) return
      const rect = el.getBoundingClientRect()
      window.scrollTo(0, rect.top + window.scrollY + at * rect.height - window.innerHeight / 2)
    }),
  )
}
