import { motion } from './motion'

// Native scrolling everywhere, so the page follows the finger, wheel or trackpad exactly.
export function initScroll(): void {
  // In-page links glide to their target and move focus there for keyboard and screen-reader users.
  document.addEventListener('click', (event) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]')
    const hash = link?.getAttribute('href')
    if (!link || !hash || hash.length < 2) return
    const target = document.querySelector<HTMLElement>(hash)
    if (!target) return
    event.preventDefault()
    target.scrollIntoView({ behavior: motion.reduced ? 'auto' : 'smooth' })
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
    history.replaceState(null, '', hash)
  })
}
