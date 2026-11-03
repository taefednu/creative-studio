export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

/** Ходит на /api (proxy Vite). Ошибка бэкенда -> ApiError с кодом; тексты берёт i18n errors.<код>. */
export async function api<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    // FormData: boundary проставит браузер, заголовок руками не ставим
    headers: body === undefined || body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  })
  let data: { detail?: unknown } | null = null
  try {
    data = await res.json()
  } catch {
    /* пустое тело */
  }
  if (!res.ok) {
    const d = data?.detail
    const code = typeof d === 'string' ? d : typeof (d as { code?: unknown } | null)?.code === 'string' ? (d as { code: string }).code : 'validation'
    throw new ApiError(res.status, code)
  }
  return data as T
}
