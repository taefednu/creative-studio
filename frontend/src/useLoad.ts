import { useCallback, useEffect, useState } from 'react'

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
  // стабильная ссылка: reload кладут в зависимости эффектов, новая на каждом рендере давала бесконечные запросы
  const reload = useCallback(() => setTick((n) => n + 1), [])
  return [data, reload]
}
