const query = window.matchMedia('(prefers-reduced-motion: reduce)')
const params = new URLSearchParams(window.location.search)

// Shared motion settings. `shot` is a screenshot mode (?shot=<section>) that jumps straight to a section.
export const motion = {
  reduced: query.matches,
  paused: false,
  shot: params.get('shot'),
}

export function initMotion(): void {
  query.addEventListener('change', () => {
    motion.reduced = query.matches
  })

  const button = document.querySelector<HTMLButtonElement>('[data-motion-toggle]')
  button?.addEventListener('click', () => {
    motion.paused = !motion.paused
    button.setAttribute('aria-pressed', String(motion.paused))
    button.setAttribute('aria-label', motion.paused ? 'Play animation' : 'Pause animation')
    document.documentElement.classList.toggle('motion-paused', motion.paused)
  })
}
