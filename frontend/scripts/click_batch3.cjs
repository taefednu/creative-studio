const { chromium } = require('playwright')
// Клики по партии 3 (вход, кабинеты родителя и учителя) на стенде stand.sh, без живых моделей.
// Запуск из frontend/: node scripts/click_batch3.cjs. Порядок важен: срочная карточка учителя закрывается последней.
const BASE = process.env.BASE || 'http://127.0.0.1:5180'
const OUT = '/tmp/ui-batch3'
require('fs').mkdirSync(OUT, { recursive: true })
const { pick } = require('./ui_helpers.cjs')
const T = (p, id) => p.getByTestId(id)
let fails = 0
const ok = (n, c, d = '') => {
  if (!c) fails++
  console.log(c ? 'PASS' : 'FAIL', n, String(d).slice(0, 140))
}
const PW = 'demo-pass-1234'
const rnd = Math.random().toString(36).slice(2, 6)

async function page(b, w = 1672, h = 941) {
  const c = await b.newContext({ viewport: { width: w, height: h } })
  const p = await c.newPage()
  p.errs = []
  p.on('console', (m) => m.type() === 'error' && p.errs.push(m.text()))
  p.on('response', (r) => r.status() >= 400 && r.url().includes('/api/') && p.errs.push(r.status() + ' ' + r.url().replace(BASE, '')))
  return p
}
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const childLogin = async (p, nick) => {
  await p.goto(BASE + '/login')
  await T(p, 'role-child').click()
  await T(p, 'nick').fill(nick)
  for (const i of [3, 7, 1]) await T(p, 'pic-' + i).click()
  await T(p, 'child-submit').click()
  await T(p, 'coins').waitFor()
}
const adult = (p, who) =>
  p.request.post(`${BASE}/api/${who}/login`, { data: { email: who === 'teacher' ? 'aziza@example.com' : 'parent@example.com', password: PW } })

;(async () => {
  const b = await chromium.launch()

  // ---------- вход ----------
  const l = await page(b)
  await l.goto(BASE + '/login')
  await T(l, 'login-card').waitFor()
  ok('фон входа /art/login-bg.webp', (await l.evaluate(() => getComputedStyle(document.querySelector('[data-testid=login-card]').parentElement.parentElement).backgroundImage)).includes('login-bg'))
  ok('шапка входа с logo и переключателем языка', (await T(l, 'login-header').locator('[data-testid=logo]').count()) === 1 && (await T(l, 'lang-toggle').count()) === 1)
  ok('у ребёнка выбрана галочка', (await T(l, 'role-check-child').count()) === 1)
  await T(l, 'role-parent').click()
  ok('роль родителя: галочка переехала, форма почты', (await T(l, 'role-check-parent').count()) === 1 && (await T(l, 'role-check-child').count()) === 0 && (await T(l, 'email').isVisible()))
  ok('поле пароля type=password', (await T(l, 'password').getAttribute('type')) === 'password')
  await T(l, 'role-teacher').click()
  ok('роль учителя: форма почты', (await T(l, 'teacher-form').count()) === 1)
  await T(l, 'role-child').click()
  await T(l, 'pic-3').click()
  await T(l, 'pic-7').click()
  ok('слоты: точки без картинок', (await T(l, 'pic-slots').innerText()).replace(/\s|Сбросить/g, '') === '' && (await T(l, 'pic-slots').locator('[data-filled=true]').count()) === 2)
  ok('на сетке нет номеров', !/\d/.test(await T(l, 'pic-grid').innerText()))
  await T(l, 'pic-clear').click()
  // мок captcha на трёх языках
  await l.route('**/api/auth/platform-login', (r) =>
    r.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ detail: { code: 'platform_captcha', messages: { ru: 'RU-капча', en: 'EN-captcha', uz: 'UZ-captcha' } } }) }),
  )
  await T(l, 'lang-toggle').click(); await T(l, 'lang-uz').click()
  await T(l, 'mentorium-login').click()
  await T(l, 'platform-login').fill('someone')
  await T(l, 'platform-password').fill('secret-not-logged')
  await T(l, 'platform-submit').click()
  await T(l, 'platform-error').waitFor()
  ok('captcha: текст на текущем языке (uz)', (await T(l, 'platform-error').innerText()) === 'UZ-captcha', await T(l, 'platform-error').innerText())
  await l.unroute('**/api/auth/platform-login')
  await T(l, 'lang-toggle').click(); await T(l, 'lang-ru').click()
  const resp = l.waitForResponse((r) => r.url().includes('/api/auth/platform-login'))
  await T(l, 'platform-submit').click()
  const rs = await resp
  const code = (await rs.json()).detail
  ok('настоящий ответ стенда: 503 platform_not_configured', rs.status() === 503 && code === 'platform_not_configured', rs.status() + ' ' + code)
  ok('понятное сообщение, что вход через Mentorium пока недоступен', /пока недоступен/.test(await T(l, 'platform-error').innerText()), await T(l, 'platform-error').innerText())
  ok('пароль остался в поле type=password и не в адресе', !l.url().includes('secret') && (await T(l, 'platform-password').getAttribute('type')) === 'password')
  await l.screenshot({ path: OUT + '/login-platform-1672.png' })
  ok('ошибки консоли входа (кроме ожидаемых 429/503)', l.errs.filter((e) => !/platform-login|Failed to load resource/.test(e)).length === 0, l.errs.join('|'))

  // ---------- ребёнок без родителя: код «покажи родителю» ----------
  const c = await page(b)
  let kid = null
  for (const n of ['Lumi', 'SkyFox', 'PixelPanda', 'MoonCat', 'DinoDash', 'LimeLion', 'OllieTree', 'SunnyBee', 'TikTak', 'Zuzu']) {
    await childLogin(c, n)
    await T(c, 'avatar-me').click()
    if ((await T(c, 'parent-code').count()) === 1) {
      kid = n
      break
    }
    await T(c, 'logout').click()
    await c.waitForURL('**/login')
  }
  ok('нашёлся ребёнок без родителя с кнопкой parent-code', !!kid, kid)
  await T(c, 'parent-code').click()
  await T(c, 'parent-code-value').waitFor()
  const pcode = (await T(c, 'parent-code-value').innerText()).trim()
  ok('код 6 символов крупно и срок', /^[A-Z0-9]{6}$/.test(pcode) && /\d+/.test(await T(c, 'parent-code-value').locator('xpath=..').innerText()), pcode)
  await c.screenshot({ path: OUT + '/parent-code-1672.png' })
  // 409: подмена me у ребёнка с родителем
  const s = await page(b)
  await childLogin(s, 'StarFox')
  await s.route('**/api/child/me', async (r) => {
    const j = await (await r.fetch()).json()
    await r.fulfill({ json: { ...j, has_parent: false, needs_adult: true } })
  })
  await s.reload()
  await T(s, 'needs-adult').waitFor()
  ok('needs_adult: подсказка «нужен взрослый»', true, await T(s, 'needs-adult').innerText())
  await T(s, 'avatar-me').click()
  await T(s, 'parent-code').click()
  await T(s, 'parent-code-error').waitFor()
  ok('409 already_linked: понятный текст', /уже привязан/.test(await T(s, 'parent-code-error').innerText()), await T(s, 'parent-code-error').innerText())

  // ---------- родитель ----------
  const p = await page(b)
  await adult(p, 'parent')
  await p.goto(BASE + '/parent')
  await T(p, 'kid-card').first().waitFor()
  ok('шапка кабинета: вкладки и me-adult', (await T(p, 'cabinet-header').locator('[data-testid^=tab-]').count()) >= 3 && (await T(p, 'me-adult').innerText()).includes('StarFox'), await T(p, 'me-adult').innerText())
  ok('бейдж числа на вкладке «Проверка» из useReviewCount', /^\d+$/.test((await T(p, 'tab-review-badge').innerText()).trim()))
  ok('page-title «Мои дети»', (await T(p, 'page-title').innerText()) === 'Мои дети')
  ok('у «+ Монеты» метка «скоро», не активна', await T(p, 'add-coins-StarFox').isDisabled())
  ok('строка «монеты с уроков» не нарисована при null', (await T(p, 'kid-lessons').count()) === 0)
  const api = (path) => p.evaluate((u) => fetch(u).then((r) => r.json()), path)
  const kids = await api('/api/parent/children')
  const star = kids.find((k) => k.nick === 'StarFox')
  const bunny = kids.find((k) => k.nick === 'Bunny')
  const aS = await api(`/api/parent/children/${star.id}/analytics`)
  const aB = await api(`/api/parent/children/${bunny.id}/analytics`)
  await T(p, 'week-created').waitFor()
  const num = async (id) => Number((await T(p, id).innerText()).replace(/\D+/g, ' ').trim().split(' ').pop())
  const bars = async () => p.locator('[data-testid^=week-bar-]').evaluateAll((a) => a.map((x) => Number(x.getAttribute('data-count'))))
  const sum = (a) => a.reduce((x, y) => x + y, 0)
  // «Картинки» = сумма столбцов (7 календарных дней), а не API created (7×24 ч)
  ok('StarFox: плашки = API, «Картинки» = сумма столбцов', (await num('week-created')) === sum(await bars()) && (await num('week-published')) === aS.published && (await num('week-held')) === aS.held, `${aS.created}/${aS.published}/${aS.held}`)
  const bS = await bars()
  ok('график: 7 столбцов, сумма > 0', bS.length === 7 && bS.reduce((x, y) => x + y, 0) > 0, bS.join(','))
  await p.screenshot({ path: OUT + '/parent-1672.png' })
  await T(p, 'kid-open-Bunny').click()
  await p.waitForFunction(() => document.querySelector('[data-testid=week] h2')?.textContent?.includes('Bunny'))
  const bB = await bars()
  ok('Bunny выбран: заголовок, плашки = API, столбцы другие', (await num('week-created')) === sum(bB) && (await num('week-published')) === aB.published && JSON.stringify(bB) !== JSON.stringify(bS), `${aB.created}/${aB.published} ${bB.join(',')}`)
  ok('latest: последние работы выбранного ребёнка', (await T(p, 'latest').locator('img').count()) > 0)
  await T(p, 'latest-link').click()
  await p.waitForURL('**/parent/feed')
  ok('клик по latest ведёт на /parent/feed', true)
  await p.goBack()
  await T(p, 'kid-card').first().waitFor()
  await T(p, 'kid-open-StarFox').click()
  ok('у StarFox есть блок latest с его работами', (await T(p, 'latest').count()) === 1)
  await T(p, 'qr-StarFox').click()
  await T(p, 'qr-box').waitFor()
  ok('QR остался', true)
  // привязка: неверный код
  await T(p, 'add-child-tile').click() // привязка живёт в окне «Добавить ребёнка»
  await T(p, 'link-cell-0').click()
  await p.keyboard.type('AAAAAA')
  ok('6 клеток заполнились при наборе', (await T(p, 'link-cell-5').inputValue()) === 'A')
  await T(p, 'link-submit').click()
  await T(p, 'link-error').waitFor()
  ok('неверный код: текст на ru', /неверный|срок/.test(await T(p, 'link-error').innerText()), await T(p, 'link-error').innerText())
  // вставка из буфера в первую клетку
  await T(p, 'link-cell-0').evaluate((el, v) => {
    const dt = new DataTransfer()
    dt.setData('text', v)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, ' ' + pcode.toLowerCase() + ' ')
  ok('вставка раскладывает код по клеткам', (await p.locator('[data-testid^=link-cell-]').evaluateAll((a) => a.map((x) => x.value).join(''))) === pcode)
  await T(p, 'link-submit').click()
  await T(p, 'link-done').waitFor()
  await T(p, 'kid-open-' + kid).waitFor()
  ok('привязка: ребёнок появился в списке', true, kid)
  await c.reload()
  await T(c, 'coins').waitFor()
  await T(c, 'avatar-me').click()
  ok('ребёнок больше не видит parent-code', (await T(c, 'parent-code').count()) === 0)
  // добавление ребёнка в окне
  await T(p, 'add-kid-close').click()
  await T(p, 'add-child-tile').click()
  await T(p, 'add-kid-modal').waitFor()
  const scrim = await T(p, 'add-kid-modal').evaluate((e) => getComputedStyle(e).backgroundColor)
  ok('затемнение окна добавления: реальный backgroundColor', scrim === 'rgba(31, 42, 92, 0.55)', scrim)
  const nk = 'Kid' + rnd
  await T(p, 'kid-nick').fill(nk)
  for (const i of [2, 4, 6]) await T(p, 'pic-' + i).click()
  await T(p, 'kid-submit').click()
  await T(p, 'error').waitFor()
  ok('ник проверяет модель: на стенде без моделей настоящий отказ показан в окне', (await T(p, 'add-kid-modal').count()) === 1, await T(p, 'error').innerText())
  // успех подменён: ник проходит только живой моделью; закрытие окна и перезагрузка списка — настоящие
  await p.route('**/api/parent/children', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 201, json: { id: 9999, nick: nk } }) : r.continue()))
  await T(p, 'kid-submit').click()
  await T(p, 'add-kid-modal').waitFor({ state: 'detached' })
  await p.unroute('**/api/parent/children')
  ok('успех (подмена 201): окно закрыто', true)
  // вкладки
  await T(p, 'tab-review').click()
  await p.waitForURL('**/parent/review')
  await p.getByRole('heading', { name: 'Уведомления' }).waitFor()
  ok('/parent/review: очередь и уведомления', (await T(p, 'review').count()) === 1 && (await p.getByRole('heading', { name: 'Уведомления' }).count()) === 1, (await T(p, 'review').count()) + (await p.getByRole('heading').allInnerTexts()).join('/'))
  await T(p, 'tab-plans').click()
  await p.waitForURL('**/parent/plans')
  const plans = await api('/api/parent/tariffs')
  await T(p, 'plan-card').first().waitFor()
  ok('тарифы: карточки из данных, кнопок покупки нет, цена из данных', (await T(p, 'plans').locator('button').count()) === 0 && (await T(p, 'plans').innerText()).includes(String(plans.packs[0].coins)), await T(p, 'plans').innerText().then((x) => x.replace(/\n/g, ' ')))
  ok('платёжных полей нет', (await p.locator('input').count()) === 0)
  await p.screenshot({ path: OUT + '/plans-1672.png' })
  await T(p, 'tab-kids').click()
  await p.waitForURL((u) => u.pathname === '/parent')
  ok('вкладка «Мои дети» возвращает', true)
  ok('ошибки консоли родителя (кроме ожидаемого 404 неверного кода)', p.errs.filter((e) => !/link-child|parent\/children|Failed to load resource/.test(e)).length === 0, p.errs.join('|'))
  // выход через меню
  await T(p, 'me-adult').click()
  await T(p, 'logout').click()
  await p.waitForURL('**/login')
  ok('выход из меню me-adult', true)

  // ---------- ширины × языки без горизонтального скролла ----------
  const wide = await page(b, 390, 844)
  const sizes = [320, 390, 768, 1024, 1280, 1672]
  await wide.goto(BASE + '/login')
  for (const who of ['parent', 'teacher']) {
    await adult(wide, who)
    const paths = who === 'parent' ? ['/parent', '/parent/review', '/parent/plans'] : ['/teacher', '/teacher/tasks', '/teacher/classes']
    for (const lang of ['ru', 'uz']) {
      await wide.evaluate((x) => localStorage.setItem('studio.lang', x), lang)
      for (const path of paths) {
        await wide.goto(BASE + path)
        await T(wide, 'page-title').waitFor()
        await wide.waitForTimeout(400)
        const bad = []
        for (const w of sizes) {
          await wide.setViewportSize({ width: w, height: 900 })
          if (!(await noScroll(wide))) bad.push(w)
        }
        ok(`без гор. скролла ${who}${path} ${lang}`, bad.length === 0, bad.join(','))
      }
    }
  }
  await wide.setViewportSize({ width: 390, height: 844 })
  await wide.evaluate(() => localStorage.setItem('studio.lang', 'ru'))
  await adult(wide, 'parent')
  await wide.goto(BASE + '/parent')
  await T(wide, 'kid-card').first().waitFor()
  const nav = await T(wide, 'tab-kids').evaluate((e) => getComputedStyle(e.closest('nav')).position)
  ok('родитель на 390: вкладки в нижней панели', nav === 'fixed', nav)
  const cols = await T(wide, 'week').evaluate((e) => e.getBoundingClientRect().left)
  ok('колонки стопкой на 390 (week слева на краю)', cols < 40, cols)
  await wide.screenshot({ path: OUT + '/parent-390.png', fullPage: true })

  // ---------- учитель ----------
  const t = await page(b)
  await adult(t, 'teacher')
  await t.goto(BASE + '/teacher')
  await T(t, 'review').waitFor()
  await t.waitForTimeout(800)
  ok('учитель: вкладки и me-adult', (await T(t, 'tab-classfeed').count()) === 1 && (await T(t, 'me-adult').count()) === 1)
  ok('классов два — фильтр есть', (await T(t, 'class-filter').count()) === 1)
  await T(t, 'tab-tasks').click()
  await t.waitForURL('**/teacher/tasks')
  await T(t, 'task-form').waitFor()
  ok('вкладка заданий: форма нового задания (страница больше не пустая)', (await T(t, 'task-form').count()) === 1)
  await T(t, 'tab-classes').click()
  await t.waitForURL('**/teacher/classes')
  await T(t, 'class-code').first().waitFor()
  ok('вкладка классов: коды и room-*', (await T(t, 'room-4B Stars').count()) === 1)
  await T(t, 'open-4B Stars').click()
  ok('«Дети» открывает окно со списком', (await T(t, 'kids-modal').count()) === 1)
  await T(t, 'kids-modal-close').click()
  await T(t, 'new-class').click()
  await T(t, 'class-name').fill('5Z' + rnd)
  await T(t, 'class-create').click()
  await T(t, 'error').waitFor()
  ok('создание класса на /teacher/classes доходит до сервера (стенд без модели отказывает названию, ошибка показана)', (await T(t, 'room-5Z' + rnd).count()) === 0)
  await T(t, 'class-modal-close').click() // окно создания остаётся после ошибки и закрывает вкладки
  await T(t, 'tab-classfeed').click()
  await t.waitForURL('**/teacher/feed/*')
  ok('«Лента класса» ведёт на ленту первого класса', true, t.url())
  await T(t, 'tab-review').click()
  await t.waitForURL((u) => u.pathname === '/teacher')
  // второй класс подменён в ответе списка классов: на стенде название класса проверяет модель
  await t.route('**/api/teacher/classes', async (r) => {
    const j = await (await r.fetch()).json()
    await r.fulfill({ json: [...j, { id: 999, name: '5Z' + rnd, code: 'ZZZZZZ' }] })
  })
  await t.reload()
  await T(t, 'class-filter').waitFor()
  await T(t, 'review').waitFor()
  await t.waitForTimeout(800)
  const all = await T(t, 'review-item').count()
  await pick(t, 'class-filter', '5Z' + rnd)
  ok('фильтр: чужой класс скрыл карточки своего класса, срочные и без класса остаются', (await T(t, 'review-item').count()) < all)
  await pick(t, 'class-filter', '4B Stars')
  const inClass = await T(t, 'review-item').count()
  ok('фильтр: 4B Stars показывает только свой класс', inClass <= all, `${inClass}/${all}`)
  await pick(t, 'class-filter', '')
  ok('фильтр «Все классы» возвращает всё', (await T(t, 'review-item').count()) === all)
  // загрузка PixelPanda: две миниатюры (если сид уже разобран прежним прогоном — подмена очереди с теми же полями)
  let mocked = false
  if ((await t.locator('[data-testid=review-item]', { hasText: 'PixelPanda' }).count()) === 0) {
    mocked = true
    await t.route('**/api/review/queue', async (r) => {
      const j = await (await r.fetch()).json()
      await r.fulfill({ json: [...j, { id: 9001, item_type: 'upload', nick: 'PixelPanda', where: 'class', class_name: '4B Stars', reason_codes: ['blurred_face'], urgent: false, status: 'pending', created_at: new Date().toISOString().slice(0, 19), preview_text: null, image_url: '/art/login-bg.webp', original_url: '/art/login-bg.webp', blurred_url: '/art/star.webp' }] })
    })
    await t.reload()
    await T(t, 'review-item').first().waitFor()
  }
  const panda = t.locator('[data-testid=review-item]', { hasText: 'PixelPanda' })
  await panda.locator('[data-testid=review-original]').waitFor()
  const loaded = await panda.locator('figure img').evaluateAll((a) => a.map((i) => i.complete && i.naturalWidth > 0))
  ok('PixelPanda: «Оригинал» и «Размыто» рядом, обе картинки загружены' + (mocked ? ' (очередь подменена)' : ''), loaded.length === 2 && loaded.every(Boolean) && (await panda.innerText()).includes('Оригинал') && (await panda.innerText()).includes('Размыто'), loaded.join(','))
  ok('у других карточек оригинала нет', (await T(t, 'review-original').count()) === 1)
  ok('причина blurred_face переведена, не «Нужна проверка»', (await panda.locator('[data-testid=review-reason]').innerText()) === 'Размыто лицо', await panda.locator('[data-testid=review-reason]').innerText())
  if (mocked) { await t.unroute('**/api/review/queue'); await t.reload(); await T(t, 'review').waitFor(); await t.waitForTimeout(800) }
  await t.screenshot({ path: OUT + '/teacher-1672.png' })
  // approve / reject двигают бейдж
  const plain = '[data-testid=review-item]:not(:has-text("PixelPanda"))'
  if ((await t.locator(plain).count()) < 2) ok('для approve/reject нужно 2 обычные карточки: стенд разобран прежним прогоном, нужен свежий seed_demo', false)
  else {
    const badge = async () => Number((await T(t, 'tab-review-badge').innerText()).trim())
    const n0 = await badge()
    await t.locator(plain + ' [data-testid=review-reject]').first().click()
    await t.waitForFunction((n) => Number(document.querySelector('[data-testid=tab-review-badge]')?.textContent) === n - 1, n0)
    ok('reject: бейдж −1', true, `${n0}->${n0 - 1}`)
    await t.locator(plain + ' [data-testid=review-approve]').first().click()
    await t.waitForFunction((n) => Number(document.querySelector('[data-testid=tab-review-badge]')?.textContent) === n - 2, n0)
    ok('approve: бейдж −1', true, `${n0 - 1}->${n0 - 2}`)
  }
  // срочное: последним
  const urgent = T(t, 'review-urgent')
  await urgent.waitFor()
  const detail = await t.evaluate(async () => {
    const q = await fetch('/api/review/queue').then((r) => r.json())
    const u = q.find((i) => i.urgent)
    const d = await fetch('/api/review/items/' + u.id).then((r) => r.json())
    return { id: u.id, text: d.preview_text, listText: u.preview_text }
  })
  ok('срочная: в списке API текста нет', detail.listText === null, detail.listText)
  ok('срочная: ровно одна кнопка review-open, нет «Одобрить/Отклонить»', (await urgent.locator('button').count()) === 1 && (await urgent.locator('[data-testid=review-open]').count()) === 1 && (await urgent.locator('[data-testid=review-approve],[data-testid=review-reject]').count()) === 0)
  const utext = await urgent.innerText()
  ok('срочная: нет текста ребёнка и «Personal info»', !(detail.text && utext.includes(detail.text)) && !/Personal info|Личные данные/.test(utext), utext.replace(/\n/g, ' | '))
  ok('срочная: подпись urgentNote', await T(t, 'review-urgent-note').isVisible())
  // подмена 500: «Я посмотрел(а)» нельзя нажать вслепую
  await t.route(/\/api\/review\/items\/\d+$/, (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"x"}' }))
  await T(t, 'review-open').click()
  await T(t, 'review-modal-error').waitFor()
  ok('500 при загрузке: ошибка и повтор, «посмотрел» disabled', (await T(t, 'review-seen').isDisabled()) && (await T(t, 'review-modal-retry').isVisible()))
  const scr = await T(t, 'review-modal').evaluate((e) => getComputedStyle(e).backgroundColor)
  ok('затемнение окна срочного: реальный backgroundColor', scr === 'rgba(31, 42, 92, 0.55)', scr)
  await t.unroute(/\/api\/review\/items\/\d+$/)
  await T(t, 'review-modal-retry').click()
  await t.waitForFunction(() => !document.querySelector('[data-testid=review-seen]')?.disabled)
  ok('после повтора текст в окне есть, «посмотрел» доступна', (await T(t, 'review-modal-text').innerText()) === detail.text, await T(t, 'review-modal-text').innerText())
  await t.screenshot({ path: OUT + '/urgent-modal-1672.png' })
  await T(t, 'review-seen').click()
  await T(t, 'review-modal').waitFor({ state: 'detached' })
  await t.waitForFunction(() => document.querySelectorAll('[data-testid=review-urgent]').length === 0)
  ok('«посмотрел» убрал срочную карточку', true)
  ok('ошибки консоли учителя (кроме подмены 500)', t.errs.filter((e) => !/review\/items|teacher\/classes|Failed to load resource/.test(e)).length === 0, t.errs.join('|'))

  await b.close()
  console.log(fails ? `\nFAIL: ${fails}` : '\nВсе PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => {
  console.log('FAIL сценарий упал:', e.message.split('\n').slice(0, 3).join(' '))
  process.exit(1)
})
