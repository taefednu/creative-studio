/**
 * Все окна закрываются одинаково: React уже убрал окно, а его снимок ещё 140 мс мягко гаснет поверх страницы.
 * Держать окна смонтированными до конца анимации пришлось бы в каждом из десятка мест. Снимок без testid и нажимать нельзя.
 */
const OUT_MS = 140

function fadeOut(win: Element) {
  const ghost = win.cloneNode(true) as HTMLElement
  ghost.setAttribute('inert', '')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.classList.add('win-closing')
  ghost.classList.remove('modal-bg')
  for (const el of [ghost, ...ghost.querySelectorAll('[data-testid],[role],[id]')]) {
    el.removeAttribute('data-testid')
    el.removeAttribute('role')
    el.removeAttribute('id')
  }
  document.body.append(ghost)
  window.setTimeout(() => ghost.remove(), OUT_MS)
}

export function watchWindowExit() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.removedNodes) {
        if (!(node instanceof Element)) continue
        const win = node.matches('.modal-bg') ? node : node.querySelector('.modal-bg')
        if (win && !win.classList.contains('win-closing')) fadeOut(win)
      }
    }
  }).observe(document.body, { childList: true, subtree: true })
}
