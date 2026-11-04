/**
 * Все картинки появляются одинаково: пока грузится, на её месте дышит заглушка; пришла — мягко проявляется и садится на место.
 * Одним наблюдателем на всё приложение: иначе пришлось бы менять каждый <img>. Из кэша картинка стоит сразу, без анимации.
 */
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'

function reveal(img: HTMLImageElement) {
  if (img.dataset.reveal || img.complete || img.classList.contains('feed-img')) return // у картинок ленты своё проявление
  img.dataset.reveal = '1'
  img.classList.add('img-loading')
  const end = () => {
    img.classList.remove('img-loading')
    if (!img.naturalWidth) return // не загрузилась: без анимации, заглушка не остаётся
    img.animate([{ opacity: 0, transform: 'scale(1.05)' }, { opacity: getComputedStyle(img).opacity, transform: 'none' }], { duration: 520, easing: EASE_OUT })
  }
  img.addEventListener('load', end, { once: true })
  img.addEventListener('error', end, { once: true })
}

export function watchImages() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (!(node instanceof Element)) continue
        if (node instanceof HTMLImageElement) reveal(node)
        else node.querySelectorAll('img').forEach(reveal)
      }
    }
  }).observe(document.body, { childList: true, subtree: true })
}
