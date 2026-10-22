import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { motion } from './motion'

gsap.registerPlugin(ScrollTrigger)

export function initScroll(): void {
  let lenis: Lenis | null = null

  if (!motion.reduced && !motion.shot) {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true })
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add((time) => lenis?.raf(time * 1000))
    gsap.ticker.lagSmoothing(0)
  }

  // In-page links glide with Lenis and move focus to the target for keyboard and screen-reader users.
  document.addEventListener('click', (event) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]')
    const hash = link?.getAttribute('href')
    if (!link || !hash || hash.length < 2) return
    const target = document.querySelector<HTMLElement>(hash)
    if (!target) return
    event.preventDefault()
    if (lenis) lenis.scrollTo(target, { duration: 1.4 })
    else target.scrollIntoView({ behavior: motion.reduced ? 'auto' : 'smooth' })
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
    history.replaceState(null, '', hash)
  })
}
