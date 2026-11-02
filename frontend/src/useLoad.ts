import { useCallback, useEffect, useState } from 'react'

/** Грузит данные при монтировании и по reload(). fn должна быть стабильной (вне компонента). Третье значение — сбой последней загрузки. */
export function useLoad<T>(fn: () => Promise<T>): [T | null, () => void, boolean] {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    fn()
      .then((d) => alive && (setData(d), setFailed(false)))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [fn, tick])
  // стабильная ссылка: reload кладут в зависимости эффектов, новая на каждом рендере давала бесконечные запросы
  const reload = useCallback(() => setTick((n) => n + 1), [])
  return [data, reload, failed]
}
