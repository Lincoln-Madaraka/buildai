const query = window.matchMedia('(prefers-reduced-motion: reduce)')
const params = new URLSearchParams(window.location.search)

// Shared motion settings. `shot` is a screenshot mode (?shot=<section>) that jumps straight to a section.
export const motion = {
  reduced: query.matches,
  shot: params.get('shot'),
}

export function initMotion(): void {
  query.addEventListener('change', () => {
    motion.reduced = query.matches
  })
  // Lets CSS skip the hero's intro animation in screenshot mode.
  if (motion.shot) document.documentElement.classList.add('is-shot')
}
