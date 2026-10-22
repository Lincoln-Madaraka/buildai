import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// Content is on the page from the first paint; the only scroll effect left is the manifesto lighting up.
export function initReveal(): void {
  // "New place. New job. New person." lights up phrase by phrase as the section scrolls through.
  const phrases = gsap.utils.toArray<HTMLElement>('[data-phrase]')
  const why = document.querySelector('#why')
  if (why && phrases.length) {
    ScrollTrigger.create({
      trigger: why,
      start: 'top 65%',
      end: 'bottom 55%',
      onUpdate: (self) => {
        const lit = Math.min(phrases.length, Math.floor(self.progress * (phrases.length + 0.5) + 0.4))
        phrases.forEach((phrase, i) => phrase.classList.toggle('is-lit', i < lit))
      },
    })
  }
}
