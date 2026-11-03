import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { useEffect } from 'react'

let lenis: Lenis | null = null

/** Плавная прокрутка колесом на длинных страницах. На телефоне прокрутка своя, окна и списки крутятся сами. */
export function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const smooth = new Lenis({
      lerp: 0.12,
      prevent: (node) => !!node.closest('.fixed.inset-0, [role="dialog"], [role="listbox"]'),
    })
    lenis = smooth
    let raf = requestAnimationFrame(function tick(time) {
      smooth.raf(time)
      raf = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(raf)
      smooth.destroy()
      lenis = null
    }
  }, [])
}

export function scrollToSmooth(target: HTMLElement | number) {
  if (lenis) lenis.scrollTo(target)
  else if (typeof target === 'number') window.scrollTo({ top: target, behavior: 'smooth' })
  else target.scrollIntoView({ behavior: 'smooth' })
}
