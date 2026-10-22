import { LINKS } from '../config'

export function initLinks(): void {
  document.querySelectorAll<HTMLAnchorElement>('[data-link]').forEach((link) => {
    const url = LINKS[link.dataset.link as keyof typeof LINKS]
    if (!url) return
    link.href = url
    if (/^https?:/.test(url)) {
      link.target = '_blank'
      link.rel = 'noopener'
    }
  })
}
