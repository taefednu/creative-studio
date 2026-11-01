import { useEffect, useState } from 'react'

/** Грузит данные при монтировании и по reload(). fn должна быть стабильной (вне компонента). */
export function useLoad<T>(fn: () => Promise<T>): [T | null, () => void] {
  const [data, setData] = useState<T | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    fn()
      .then((d) => alive && setData(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [fn, tick])
  return [data, () => setTick((n) => n + 1)]
}
