import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { motion } from './motion'

gsap.registerPlugin(ScrollTrigger, SplitText)

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

  // With reduced motion, or in screenshot mode, everything is simply visible.
  if (motion.reduced || motion.shot) return

  const items = gsap.utils.toArray<HTMLElement>('[data-reveal]')
  gsap.set(items, { autoAlpha: 0, y: 28 })
  ScrollTrigger.batch(items, {
    start: 'top 90%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, { autoAlpha: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08, overwrite: true }),
  })

  const headline = document.querySelector<HTMLElement>('[data-split]')
  if (headline) {
    const split = SplitText.create(headline, { type: 'words', tag: 'span', wordsClass: 'word', mask: 'words' })
    gsap.from(split.words, { yPercent: 115, duration: 1.25, ease: 'expo.out', stagger: 0.07, delay: 0.15 })
  }
}
