const { chromium } = require('playwright')
const { pick, optionValues } = require('./ui_helpers.cjs')
// Партия 4б: ChipSelect, голос (#16), загрузка (#15) на стенде stand.sh. Живых моделей нет:
// настоящие запросы — формат записи (ждём 502/504, не 400), загрузка (held), 415 и 413; успех голоса и готовая загрузка подменены route.
// Запуск из frontend/: node scripts/click_batch5.cjs
const BASE = process.env.BASE || 'http://127.0.0.1:5180'
const OUT = '/tmp/ui-batch5'
const OVERLAY = require('path').resolve(__dirname, '../../docs/design/measure/overlay')
require('fs').mkdirSync(OUT, { recursive: true })
const I18N = { ru: require('../src/i18n/ru.json'), en: require('../src/i18n/en.json'), uz: require('../src/i18n/uz.json') }
const T = (p, id) => p.getByTestId(id)
let fails = 0
const ok = (n, c, d = '') => {
  if (!c) fails++
  console.log(c ? 'PASS' : 'FAIL', n, String(d).slice(0, 200))
}
const BAN = {
  ru: /заблок|ошибк|нельзя|нарисуй|идея|идеи|дружеск|монет/i,
  en: /block|error|draw|idea|friendly|coin|not allowed/i,
  uz: /bloklan|xato|chiz|g‘oya|do‘stona|tanga|mumkin emas/i,
}
async function page(b, { w = 1672, h = 941, lang = 'ru' } = {}) {
  const c = await b.newContext({ viewport: { width: w, height: h } })
  await c.addInitScript((l) => {
    localStorage.setItem('studio.lang', l)
    // все потоки микрофона, чтобы проверить, что их отпустили
    const gum = navigator.mediaDevices && navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    window.__streams = []
    window.__wav = null
    const f0 = window.fetch.bind(window)
    window.fetch = async (u, o) => {
      const a = o && o.body instanceof FormData && o.body.get('audio')
      if (a && a.arrayBuffer) { const d = new DataView(await a.arrayBuffer()); window.__wav = { rate: d.getUint32(24, true), ch: d.getUint16(22, true), bits: d.getUint16(34, true), seconds: d.getUint32(40, true) / 2 / d.getUint32(24, true), riff: String.fromCharCode(d.getUint8(0), d.getUint8(1), d.getUint8(2), d.getUint8(3)) } }
      return f0(u, o)
    }
    if (gum) navigator.mediaDevices.getUserMedia = async (c) => { const s = await gum(c); window.__streams.push(s); return s }
  }, lang)
  const p = await c.newPage()
  p.errs = []
  p.on('console', (m) => m.type() === 'error' && p.errs.push(m.text()))
  return p
}
const child = (p, nick) => p.request.post(`${BASE}/api/child/login`, { data: { nick, pictures: [3, 7, 1] } })
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const inView = (p, id) => p.getByTestId(id).evaluate((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight })
const png = (p) => p.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const x = c.getContext('2d'); x.fillStyle = '#4aa3ff'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(32, 32, 18, 0, 7); x.fill()
  const b = await new Promise((r) => c.toBlob(r, 'image/png')); return Array.from(new Uint8Array(await b.arrayBuffer()))
})
;(async () => {
  const b = await chromium.launch()
  const bv = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })

  // ---------- 1. ChipSelect ----------
  const c = await page(b)
  await child(c, 'StarFox')
  await c.goto(BASE + '/create')
  await T(c, 'panel-style').waitFor({ timeout: 20000 })
  await T(c, 'panel-style').click()
  const list = T(c, 'panel-style-list')
  await list.waitFor()
  ok('список открыт: aria-expanded, role=listbox, options', (await T(c, 'panel-style').getAttribute('aria-expanded')) === 'true' && (await list.getAttribute('role')) === 'listbox' && (await list.locator('[role=option]').count()) >= 8)
  ok('у опций картинки шаблонов', (await list.locator('img').count()) >= 8)
  ok('выбранная строка: aria-selected + галочка', (await list.locator('[aria-selected=true] svg').count()) === 1)
  const r = await Promise.all([list.boundingBox(), T(c, 'panel-style').boundingBox()])
  ok('открыт вверх или целиком над кнопкой/под ней, не перекрывает её', r[0].y + r[0].height <= r[1].y + 1 || r[0].y >= r[1].y + r[1].height - 1, JSON.stringify(r[0]))
  ok('попап в окне', await inView(c, 'panel-style-list'))
  const clipped = (pg) => T(pg, 'panel-style-list').locator('[role=option] > span.flex-1').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length)
  ok('1672: подписи стилей не обрезаны, попап не шире 340', (await clipped(c)) === 0 && r[0].width <= 340.5, `${r[0].width}`)
  ok('фокус на кнопке при открытии', (await c.evaluate(() => document.activeElement?.dataset.testid)) === 'panel-style')
  await c.waitForTimeout(250)
  await c.screenshot({ path: `${OVERLAY}/menus-1672.jpg`, type: 'jpeg', quality: 85 })
  await c.keyboard.press('Escape')
  ok('Esc закрывает, фокус на кнопке', (await list.count()) === 0 && (await c.evaluate(() => document.activeElement?.dataset.testid)) === 'panel-style')
  await T(c, 'panel-style').click(); await c.mouse.click(5, 300)
  ok('клик снаружи закрывает', (await list.count()) === 0)
  await T(c, 'panel-style').focus(); await c.keyboard.press('ArrowDown')
  ok('ArrowDown на кнопке открывает', (await list.count()) === 1)
  await c.keyboard.press('ArrowDown'); await c.keyboard.press('ArrowDown'); await c.keyboard.press('Enter')
  const vals = await optionValues(c, 'panel-style')
  const pressed = await c.evaluate(() => document.querySelector('[data-testid^="tpl-"][aria-pressed=true]')?.dataset.testid)
  ok('стрелки + Enter меняют шаблон на экране', vals.length >= 8 && /^tpl-/.test(pressed) && pressed !== 'tpl-' + vals[0], pressed)
  await T(c, 'panel-style').focus(); await c.keyboard.press('ArrowDown'); await c.keyboard.press('Tab')
  ok('Tab закрывает', (await list.count()) === 0)
  await pick(c, 'panel-style', vals[1])
  ok('мышью: шаблон выбран', (await c.evaluate(() => document.querySelector('[data-testid^="tpl-"][aria-pressed=true]')?.dataset.testid)) === 'tpl-' + vals[1])
  // лента: фильтр стиля и плавающая панель — только вверх
  await c.goto(BASE + '/'); await T(c, 'post-card').first().waitFor({ timeout: 20000 })
  await T(c, 'panel-style').click()
  ok('плавающая панель на ленте: список строго вверх', (await T(c, 'panel-style-list').getAttribute('data-up')) === 'true')
  await c.keyboard.press('Escape')
  await pick(c, 'style-filter', vals[2]); ok('фильтр стиля работает', (await T(c, 'style-filter').innerText()).length > 0)
  await c.context().close()

  // телефон
  const m = await page(b, { w: 390, h: 844 })
  await child(m, 'StarFox')
  await m.goto(BASE + '/create'); await T(m, 'panel-style').waitFor({ timeout: 20000 })
  await T(m, 'panel-style').click(); await T(m, 'panel-style-list').waitFor(); await m.waitForTimeout(250)
  ok('телефон: список влезает, скролл внутри', (await inView(m, 'panel-style-list')) && (await noScroll(m)))
  ok('телефон: подписи не обрезаны, попап не шире экрана-16', (await clipped(m)) === 0 && (await T(m, 'panel-style-list').boundingBox()).width <= 390 - 16 + 0.5)
  await m.keyboard.press('Escape')
  await m.setViewportSize({ width: 390, height: 440 }) // низкий экран: 8 стилей не помещаются, список скроллится
  await T(m, 'panel-style').click(); await T(m, 'panel-style-list').waitFor(); await m.waitForTimeout(250)
  const lb = await T(m, 'panel-style-list').boundingBox()
  await m.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2)
  await m.mouse.wheel(0, 3000)
  await m.waitForTimeout(500)
  const st = await T(m, 'panel-style-list').evaluate((e) => ({ top: e.scrollTop, max: e.scrollHeight - e.clientHeight }))
  ok('телефон: колесо прокручивает список вниз и он не отскакивает', st.max > 0 && st.top >= st.max - 2, JSON.stringify(st))
  await m.screenshot({ path: `${OVERLAY}/menus-390.jpg`, type: 'jpeg', quality: 85 })
  await m.context().close()

  // noScroll × языки
  for (const lang of ['ru', 'uz']) {
    for (const w of [320, 390, 768, 1024, 1672]) {
      const p = await page(b, { w, h: w < 800 ? 740 : 941, lang })
      await child(p, 'StarFox')
      await p.goto(BASE + '/create'); await T(p, 'panel-style').waitFor({ timeout: 20000 })
      await T(p, 'panel-style').click(); await T(p, 'panel-style-list').waitFor()
      ok(`noScroll ${w} ${lang} с открытым списком`, (await noScroll(p)) && (await inView(p, 'panel-style-list')))
      await p.context().close()
    }
  }

  // ---------- 2. голос ----------
  const v = await page(bv)
  await child(v, 'StarFox')
  await v.goto(BASE + '/create'); await T(v, 'voice').waitFor({ timeout: 20000 })
  const posts = []
  v.on('request', (q) => q.method() === 'POST' && posts.push(q.url().replace(BASE, '')))
  await T(v, 'voice').click()
  await T(v, 'voice-timer').waitFor()
  await v.waitForTimeout(2300)
  const tm = await T(v, 'voice-timer').innerText()
  ok('запись: таймер считает секунды', /^00:0[1-9]$/.test(tm), tm)
  await v.screenshot({ path: `${OUT}/voice-rec-1672.png` })
  await v.screenshot({ path: `${OVERLAY}/voice-rec-1672.jpg`, type: 'jpeg', quality: 85 })
  const resp = v.waitForResponse((x) => x.url().endsWith('/api/voice/transcribe'), { timeout: 60000 })
  const busyP = v.waitForSelector('[data-testid=voice][data-state=busy]', { state: 'attached', timeout: 5000 })
  await T(v, 'voice').click()
  const busySeen = await busyP.then(() => true, () => false) // состояние busy коротко: ждём его с подпиской до клика
  ok('после стопа — «слушаю…»', busySeen)
  const rr = await resp
  const body = await rr.json().catch(() => ({}))
  ok(`настоящая ручка: ${rr.status()} ${body.detail} (ждём 502 asr_failed или 504, не 400)`, [502, 504].includes(rr.status()), `${rr.status()} ${JSON.stringify(body)}`)
  const wav = await v.evaluate(() => window.__wav)
  ok('формат: WAV RIFF 16000, mono, 16 бит', wav && wav.riff === 'RIFF' && wav.rate === 16000 && wav.ch === 1 && wav.bits === 16, JSON.stringify(wav))
  await T(v, 'error').waitFor()
  ok('ошибка ASR тёплым текстом, поле не тронуто', (await T(v, 'prompt-input').inputValue()) === '' && (await T(v, 'error').innerText()).length > 10, await T(v, 'error').innerText())
  // успех подменён
  await v.route('**/api/voice/transcribe', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'дракон на облаке' }) }))
  await T(v, 'voice').click(); await T(v, 'voice-timer').waitFor(); await v.waitForTimeout(1200); await T(v, 'voice').click()
  await v.waitForFunction(() => document.querySelector('[data-testid=prompt-input]').value !== '', null, { timeout: 15000 })
  ok('успех: текст в поле на проверку', (await T(v, 'prompt-input').inputValue()) === 'дракон на облаке')
  ok('сам ничего не отправил и не нарисовал', !posts.some((x) => x === '/api/works') && /create$/.test(v.url()), posts.join(','))
  // тёплые ошибки
  for (const [st, code] of [[422, 'no_speech'], [413, 'audio_too_long'], [400, 'bad_audio'], [411, 'length_required'], [413, 'audio_too_large']]) {
    await v.unroute('**/api/voice/transcribe')
    await v.route('**/api/voice/transcribe', (rt) => rt.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify({ detail: code }) }))
    await T(v, 'voice').click(); await T(v, 'voice-timer').waitFor(); await v.waitForTimeout(700); await T(v, 'voice').click()
    await T(v, 'error').waitFor({ timeout: 10000 })
    ok(`${st} ${code}: ключ i18n`, (await T(v, 'error').innerText()) === I18N.ru.errors[code], await T(v, 'error').innerText())
  }
  // автостоп 30 с (настоящий таймер)
  await v.unroute('**/api/voice/transcribe')
  await v.route('**/api/voice/transcribe', (rt) => { rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'ок' }) }) })
  await T(v, 'voice').click(); await T(v, 'voice-timer').waitFor()
  await v.waitForFunction(() => document.querySelector('[data-testid=voice]')?.dataset.state !== 'rec', null, { timeout: 40000 })
  await v.waitForFunction(() => document.querySelector('[data-testid=voice]')?.dataset.state === 'idle', null, { timeout: 15000 })
  const len = await v.evaluate(() => window.__wav)
  ok('само остановилось через 30 с, запись не длиннее 30 с', len && len.seconds <= 30 && len.seconds > 29, JSON.stringify(len))
  // микрофон отпущен при уходе с экрана во время записи
  await T(v, 'voice').click(); await T(v, 'voice-timer').waitFor()
  await v.getByTestId('tab-feed').first().click().catch(() => v.goto(BASE + '/tasks'))
  await v.waitForTimeout(500)
  ok('размонтирование: все дорожки микрофона закончились', await v.evaluate(() => window.__streams.length > 0 && window.__streams.every((s) => s.getTracks().every((t) => t.readyState === 'ended'))))
  await v.context().close()
  // нет разрешения
  const dn = await page(b)
  await child(dn, 'StarFox')
  await dn.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('x', 'NotAllowedError')) })
  await dn.goto(BASE + '/create'); await T(dn, 'voice').click()
  await T(dn, 'error').waitFor()
  ok('нет разрешения микрофона: тёплый текст', (await T(dn, 'error').innerText()) === I18N.ru.errors.mic_denied)
  await dn.context().close()
  // гость
  const gst = await page(b); await gst.goto(BASE + '/'); await T(gst, 'voice').click(); await gst.waitForURL('**/login')
  ok('гость: микрофон ведёт на вход', true); await gst.context().close()

  // ---------- 3. загрузка ----------
  const u = await page(b)
  await child(u, 'StarFox')
  await u.goto(BASE + '/create'); await T(u, 'upload-open').waitFor({ timeout: 20000 })
  await T(u, 'upload-open').click(); await T(u, 'upload-popup').waitFor(); await u.waitForTimeout(250)
  ok('попап: пунктир, заголовок, PNG или JPG, accept', (await T(u, 'upload-popup').innerText()).includes(I18N.ru.panel.uploadTitle) && (await T(u, 'upload-input').getAttribute('accept')) === 'image/png,image/jpeg')
  await u.screenshot({ path: `${OUT}/upload-popup-1672.png` })
  await u.screenshot({ path: `${OVERLAY}/upload-popup-1672.jpg`, type: 'jpeg', quality: 85 })
  const bytes = Buffer.from(await png(u))
  // 415: не картинка
  let r415 = u.waitForResponse((x) => x.url().endsWith('/api/works/upload'))
  await T(u, 'upload-input').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('это не картинка') })
  const s415 = (await r415).status()
  await T(u, 'error').waitFor()
  ok('415 unsupported_type настоящий + текст', s415 === 415 && (await T(u, 'error').innerText()) === I18N.ru.errors.unsupported_type, s415)
  // 413: файл больше лимита
  // 413: клиент не гонит файл больше лимита; настоящий ответ бэкенда — напрямую на :8100 (dev-прокси vite превращает ранний 413 в 502)
  let posted413 = false
  u.on('request', (q) => q.url().endsWith('/api/works/upload') && (posted413 = true))
  await T(u, 'upload-input').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.concat([bytes, Buffer.alloc(5_080_000)]) })
  await u.waitForFunction((t) => document.querySelector('[data-testid=error]')?.textContent === t, I18N.ru.errors.file_too_large, { timeout: 10000 })
  const direct = await u.request.post('http://127.0.0.1:8100/api/works/upload', { multipart: { file: { name: 'big.png', mimeType: 'image/png', buffer: Buffer.concat([bytes, Buffer.alloc(5_080_000)]) } } })
  ok('413 file_too_large: текст на экране без запроса; бэкенд отвечает 413', !posted413 && direct.status() === 413 && (await direct.json()).detail === 'file_too_large', direct.status())
  // настоящая загрузка
  const up = u.waitForResponse((x) => x.url().endsWith('/api/works/upload'))
  await T(u, 'upload-input').setInputFiles({ name: 'my.png', mimeType: 'image/png', buffer: bytes })
  const ur = await up
  ok('настоящая загрузка: 200', ur.status() === 200, ur.status())
  await u.waitForURL(/\/create\?work=\d+/)
  await T(u, 'work-held').waitFor({ timeout: 60000 })
  ok('без модели: «покажем взрослому»', (await T(u, 'work-title').innerText()) === I18N.ru.create.uploadHeldTitle, await T(u, 'work-title').innerText())
  await u.screenshot({ path: `${OVERLAY}/upload-held-1672.jpg`, type: 'jpeg', quality: 85 })
  // готовая загрузка с размытием (подмена)
  const wid = Number(new URL(u.url()).searchParams.get('work'))
  await u.route(`**/api/works/${wid}`, (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: wid, kind: 'upload', template_id: 'upload', status: 'ready', reason_codes: ['blurred_face', 'blurred_handwritten_name'], rewrite_text: null, image_url: `/api/works/${wid}/image`, adult_notified: true }) }))
  await u.reload(); await T(u, 'work-ready').waitFor({ timeout: 20000 })
  const sideTxt = await T(u, 'result-side').innerText()
  ok('результат: одна картинка без образца стиля, «Проверено ИИ», пометки про спрятанное', (await T(u, 'style-sample').count()) === 0 && (await T(u, 'result-image').innerText()).includes(I18N.ru.create.checkedByAi) && sideTxt.includes(I18N.ru.create.blurred.face) && sideTxt.includes(I18N.ru.create.blurred.handwritten_name), sideTxt)
  ok('показана только размытая версия с сервера', (await T(u, 'result-image').locator('img').getAttribute('src')) === `/api/works/${wid}/image`)
  await u.screenshot({ path: `${OVERLAY}/upload-ready-1672.jpg`, type: 'jpeg', quality: 85 })
  // support
  await u.unroute(`**/api/works/${wid}`)
  await u.route(`**/api/works/${wid}`, (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: wid, kind: 'upload', template_id: 'upload', status: 'support', reason_codes: [], rewrite_text: null, image_url: null, adult_notified: true }) }))
  await u.reload(); await T(u, 'work-support').waitFor({ timeout: 20000 })
  const sup = await T(u, 'work-support').innerText()
  ok('support: тёплый ответ без запрещённых слов (ru)', !BAN.ru.test(sup) && (await T(u, 'draw').count()) === 0, sup)
  ok('нет ошибок консоли (кроме 4xx от проверок)', u.errs.filter((e) => !/status of 4\d\d/.test(e)).length === 0, u.errs.join(' | '))
  await u.context().close()
  const um = await page(b, { w: 390, h: 844 })
  await child(um, 'StarFox'); await um.goto(BASE + '/create'); await T(um, 'upload-open').click(); await T(um, 'upload-popup').waitFor(); await um.waitForTimeout(250)
  ok('телефон: попап в окне, без горизонтального скролла', (await inView(um, 'upload-popup')) && (await noScroll(um)))
  await um.screenshot({ path: `${OVERLAY}/upload-popup-390.jpg`, type: 'jpeg', quality: 85 })
  await um.context().close()

  await b.close(); await bv.close()
  console.log(fails ? `FAILS: ${fails}` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
