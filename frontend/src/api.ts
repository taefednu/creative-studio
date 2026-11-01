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
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data: { detail?: unknown } | null = null
  try {
    data = await res.json()
  } catch {
    /* пустое тело */
  }
  if (!res.ok) {
    const d = data?.detail
    throw new ApiError(res.status, typeof d === 'string' ? d : 'validation')
  }
  return data as T
}
