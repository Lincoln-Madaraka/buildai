import { ScrollTrigger } from 'gsap/ScrollTrigger'

export function initNav(): void {
  const nav = document.querySelector<HTMLElement>('[data-nav]')
  const onScroll = () => nav?.classList.toggle('is-scrolled', window.scrollY > 24)
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  const links = document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]')
  const pages = document.querySelectorAll<HTMLAnchorElement>('[data-pager]')

  const setActive = (id: string) => {
    links.forEach((a) => a.classList.toggle('is-active', a.dataset.navLink === id))
    pages.forEach((a) => {
      const on = a.dataset.pager === id
      a.classList.toggle('is-active', on)
      if (on) a.setAttribute('aria-current', 'step')
      else a.removeAttribute('aria-current')
    })
  }

  document.querySelectorAll<HTMLElement>('main > section[id]').forEach((section) => {
    ScrollTrigger.create({
      trigger: section,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        if (self.isActive) setActive(section.id)
      },
    })
  })

  setActive('top')
}
