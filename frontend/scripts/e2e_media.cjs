// Живой прогон голоса, загрузки и ремикса: настоящие модели, синтетические данные.
// Бэкенд 8100 с .env и временной базой, фронт 5180. Запуск из frontend/:
//   node scripts/e2e_media.cjs <речь.wav> <рисунок.png>
const { chromium } = require('playwright')
const { readFileSync } = require('fs')
const [wav, picture] = process.argv.slice(2)
const BASE = 'http://localhost:5180'
const tag = Math.random().toString(16).slice(2, 6)
const PW = 'correct-horse-' + tag
let fails = 0
const ok = (name, cond, detail = '') => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${String(detail).slice(0, 160)}`) }
const T = (p, id) => p.getByTestId(id)
const post = (p, url, data) => p.request.post(BASE + url, { data })

;(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`] })
  const open = async () => {
    const c = await browser.newContext({ viewport: { width: 1672, height: 941 } })
    await c.addInitScript(() => localStorage.setItem('studio.lang', 'ru'))
    return c.newPage()
  }
  const adult = await open()
  const t = await post(adult, '/api/teacher/register', { email: `t${tag}@example.com`, password: PW })
  ok('учитель заведён', t.ok(), t.status())
  const room = await (await post(adult, '/api/teacher/classes', { name: `Stars ${tag}` })).json()
  const parent = await open()
  await post(parent, '/api/parent/register', { email: `p${tag}@example.com`, password: PW })
  const kid = async (nick) => {
    const r = await post(parent, '/api/parent/children', { nick, age_group: '9-12', lang: 'ru', pictures: [3, 7, 1] })
    ok(`ребёнок ${nick}`, r.ok(), r.status())
    const p = await open()
    await post(p, '/api/child/login', { nick, pictures: [3, 7, 1] })
    await post(p, '/api/child/join-class', { code: room.code })
    return p
  }
  const A = `SunnyFox${tag}`
  const a = await kid(A)
  const b = await kid(`MoonOwl${tag}`)

  // Голос: настоящая запись браузером, настоящий ASR
  await a.goto(BASE + '/create')
  await T(a, 'voice').waitFor()
  const asr = a.waitForResponse((r) => r.url().includes('/api/voice/transcribe'), { timeout: 60000 })
  await T(a, 'voice').click()
  await a.locator('[data-testid=voice][data-state=rec]').waitFor({ timeout: 10000 })
  ok('голос: идёт запись (data-state=rec)', true)
  // Запись сама кончается на тишине после речи из файла: вторым кликом её не останавливаем
  const rs = await asr
  await a.locator('[data-testid=voice][data-state=idle]').waitFor({ timeout: 30000 })
  const heard = await T(a, 'prompt-input').inputValue()
  ok('голос: настоящая расшифровка в поле', rs.status() === 200 && heard.trim().length > 0, `${rs.status()} «${heard}»`)
  ok('голос: сам не отправил', !a.url().includes('work='), a.url())
  await a.screenshot({ path: '/tmp/ui-e2e/voice.png' })

  // Голос → картинка: платная генерация (E2E_SKIP_VOICE_DRAW=1 пропускает)
  if (!process.env.E2E_SKIP_VOICE_DRAW) {
  await T(a, 'draw').click()
  await a.waitForURL('**/create?work=*', { timeout: 30000 })
  await T(a, 'result-image').waitFor({ timeout: 150000 })
  const res = await a.waitForResponse((r) => r.url().includes('/image') && r.status() === 200, { timeout: 20000 }).catch(() => null)
  ok('голос → картинка Muse Image', true, res ? res.url().slice(-30) : 'уже загружена')
  await a.screenshot({ path: '/tmp/ui-e2e/result.png' })
  await T(a, 'publish-class').click() // строка действует сразу, без кнопки «Отправить»
  await a.locator('[data-testid=publish-class][data-state=done]').waitFor({ timeout: 60000 })
  ok('работа выложена в класс', true)
  }

  // Загрузка с настоящим SAM
  await a.goto(BASE + '/create')
  await T(a, 'upload-open').click()
  await T(a, 'upload-input').setInputFiles({ name: 'drawing.png', mimeType: 'image/png', buffer: readFileSync(picture) })
  await T(a, 'upload-preview').waitFor({ timeout: 10000 })
  ok('выбор файла ничего не отправил: рисунок виден в окне', !a.url().includes('work='), a.url())
  await T(a, 'upload-send').click() // кнопка «Оживить»
  await a.waitForURL('**/create?work=*', { timeout: 60000 })
  const done = a.locator('[data-testid="result-image"],[data-testid="work-held"],[data-testid="work-refused"],[data-testid="work-support"],[data-testid="work-failed"]').first()
  await done.waitFor({ timeout: 180000 })
  const id = new URL(a.url()).searchParams.get('work')
  const w = await (await a.request.get(`${BASE}/api/works/${id}`)).json()
  ok('загрузка дошла до конца', ['ready', 'held'].includes(w.status), `${w.status} ${JSON.stringify(w.reason_codes)}`)
  await a.screenshot({ path: '/tmp/ui-e2e/upload.png' })
  ok('оригинал ребёнку не отдаётся', !JSON.stringify(w).includes('original'))
  // Ребёнок ушёл с экрана, пока ждёт взрослого: иначе после одобрения экран сам «оживит» рисунок (ещё одна генерация)
  if (w.status === 'held') await a.goto(BASE + '/')

  // Классификатор задержал рисунок с лицом и именем: родитель одобряет, SAM размывает, ребёнок видит размытое
  if (w.status === 'held') {
    await parent.goto(BASE + '/parent/kids')
    const title = T(parent, 'kid-panel').getByTestId('page-title')
    await title.waitFor({ timeout: 30000 })
    if ((await title.innerText()).trim() !== A) await T(parent, 'kid-list').locator(`[title="${A}"]`).click()
    await T(parent, 'review-stack').waitFor({ timeout: 30000 })
    await parent.screenshot({ path: '/tmp/ui-e2e/parent-review.png' })
    await T(parent, 'review-approve').first().click()
    await T(parent, 'kid-clear').waitFor({ timeout: 120000 }).catch(() => {})
    let after = w
    for (let i = 0; i < 40 && after.status !== 'ready'; i++) {
      await a.waitForTimeout(3000)
      after = await (await a.request.get(`${BASE}/api/works/${id}`)).json()
    }
    ok('после одобрения работа готова', after.status === 'ready', `${after.status} ${JSON.stringify(after.reason_codes)}`)
    await a.goto(`${BASE}/create?work=${id}`)
    await T(a, 'result-image').waitFor({ timeout: 30000 })
    await a.waitForTimeout(1200)
    await a.screenshot({ path: '/tmp/ui-e2e/upload-ready.png' })
    const text = await a.locator('main').innerText()
    ok('ребёнку сказано, что спрятали', /спрятал|скрыл/i.test(text), text.slice(0, 160).replace(/\n/g, ' '))
    ok('на экране работы блок «спрятали лицо»', (await T(a, 'blurred-face').count()) === 1)
    await T(a, 'publish-class').click() // размытую работу выкладываем в класс: из неё сделает ремикс одноклассник
    // Работа с размытым личным уходит на решение учителя: одноклассник её пока не видит
    await a.locator('[data-testid=publish-class][data-state=waiting]').waitFor({ timeout: 60000 })
    ok('размытая работа ждёт учителя, а не выложена сразу', true)
    await b.goto(BASE + '/')
    await T(b, 'feed-class').click()
    await T(b, 'feed-empty').waitFor({ timeout: 15000 })
    ok('одноклассник пост с размытым до решения учителя не видит', (await T(b, 'post-card').count()) === 0)
    await adult.goto(BASE + '/teacher/classes')
    await T(adult, `room-Stars ${tag}`).click()
    await T(adult, 'review-stack').waitFor({ timeout: 30000 })
    await T(adult, 'review-approve').first().click()
    await T(adult, 'room-clear').waitFor({ timeout: 30000 })
    ok('учитель одобрил пост с размытым', true)
  }

  // Ремикс одноклассником
  await b.goto(BASE + '/')
  await T(b, 'feed-class').click()
  await T(b, 'post-card').first().waitFor({ timeout: 30000 })
  // Источник ремикса: картинка по голосу. Рисунок с лицом (размытый) ремикс снова задерживает как personal_info, это ожидаемо, но готовой картинки не даёт
  const items = (await (await b.request.get(`${BASE}/api/feed/class`)).json()).items
  const src = items.findIndex((x) => x.work_kind === 'image')
  ok('в ленте класса есть картинка по голосу для ремикса', src >= 0, items.map((x) => x.work_kind).join(','))
  await T(b, 'post-card').nth(Math.max(src, 0)).click()
  await T(b, 'draw-same').click()
  await T(b, 'remix-box').waitFor()
  await T(b, 'remix-text').fill('добавь радугу')
  await T(b, 'remix-go').click()
  await b.waitForURL('**/create?work=*', { timeout: 30000 })
  await T(b, 'result-image').waitFor({ timeout: 180000 })
  ok('ремикс: готовая картинка настоящей моделью', true)
  await b.screenshot({ path: '/tmp/ui-e2e/remix.png' })
  await browser.close()
  console.log(fails ? `ИТОГ: падений ${fails}` : 'ИТОГ: всё прошло')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.log('ERR', e.message.slice(0, 400)); process.exit(2) })
