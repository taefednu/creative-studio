const { chromium } = require('playwright')
// Клики партии 4в: задания, мои работы, задания учителя, классы, тарифы. Стенд stand.sh, без живых моделей.
// Ручки с моделью и поле shared (старый бэкенд его не отдаёт) подменены route. Запуск из frontend/: node scripts/click_batch6.cjs
const BASE = process.env.BASE || 'http://127.0.0.1:5180'
const OUT = '/tmp/ui-batch6'
require('fs').mkdirSync(OUT, { recursive: true })
const I18N = { ru: require('../src/i18n/ru.json'), en: require('../src/i18n/en.json'), uz: require('../src/i18n/uz.json') }
const { pick, optionValues } = require('./ui_helpers.cjs')
const T = (p, id) => p.getByTestId(id)
let fails = 0
const ok = (n, c, d = '') => {
  if (!c) fails++
  console.log(c ? 'PASS' : 'FAIL', n, String(d).slice(0, 160))
}
const PW = 'demo-pass-1234'

async function ctx(b, who, { w = 1672, h = 941, lang = 'ru' } = {}) {
  const c = await b.newContext({ viewport: { width: w, height: h }, permissions: ['clipboard-read', 'clipboard-write'] })
  await c.addInitScript((l) => localStorage.setItem('studio.lang', l), lang)
  const p = await c.newPage()
  p.errs = []
  p.on('console', (m) => m.type() === 'error' && p.errs.push(m.text()))
  p.on('pageerror', (e) => p.errs.push(e.message))
  const r =
    who === 'child'
      ? await p.request.post(`${BASE}/api/child/login`, { data: { nick: 'StarFox', pictures: [3, 7, 1] } })
      : await p.request.post(`${BASE}/api/${who}/login`, { data: { email: who === 'teacher' ? 'aziza@example.com' : 'parent@example.com', password: PW } })
  if (!r.ok()) throw new Error('login ' + who + ' ' + r.status())
  return p
}
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

;(async () => {
  const b = await chromium.launch()

  // ---------- Мои работы: фильтры и «Поделиться» ----------
  {
    const p = await ctx(b, 'child')
    await p.route('**/api/works/mine', async (r) => {
      try {
      const list = await (await r.fetch()).json()
      const ready = list.filter((w) => w.status === 'ready')
      const shared = new Map([[ready[0].id, [{ audience: 'class', status: 'published' }]], [ready[1].id, [{ audience: 'family', status: 'waiting' }]], [ready[2].id, [{ audience: 'class', status: 'published' }, { audience: 'class', status: 'waiting' }]]])
      await r.fulfill({ json: list.map((w) => ({ ...w, shared: shared.get(w.id) ?? [] })) })
      } catch { /* страница закрыта */ }
    })
    await p.goto(BASE + '/my-works')
    await T(p, 'work-card').first().waitFor({ timeout: 20000 })
    const all = await T(p, 'work-card').count()
    await T(p, 'works-shared').click()
    const shared = await T(p, 'work-card').count()
    await T(p, 'works-waiting').click()
    const waiting = await T(p, 'work-card').count()
    ok('фильтры: все > показанные (2) и ждущие (2)', all > 2 && shared === 2 && waiting === 2, `${all}/${shared}/${waiting}`)
    ok('чипы: «Ждёт взрослого» (лавандовый) на ждущих работах', (await p.locator('[data-testid=work-chip][data-status=waiting]').evaluateAll((e) => e.length >= 2 && e.every((x) => x.innerText === 'Ждёт взрослого'))))
    await T(p, 'works-all').click()
    ok('«Все» возвращает все карточки', (await T(p, 'work-card').count()) === all)
    ok('чип «В классе» есть', (await T(p, 'work-chip').filter({ hasText: I18N.ru.mw.inClass }).count()) >= 1)
    await T(p, 'work-share').first().click()
    ok('«Поделиться» открывает окно с формой', (await T(p, 'work-modal').isVisible()) && (await T(p, 'publish-class').isVisible()))
    await p.screenshot({ path: `${OUT}/works-share-1672.png` })
    await p.keyboard.press('Escape')
    ok('Esc закрывает окно', (await T(p, 'work-modal').count()) === 0)
    ok('в консоли нет ошибок', p.errs.length === 0, p.errs.join(' | '))
    await p.context().close()
  }

  // ---------- Задания учителя: срок-пресет, язык интерфейса ----------
  for (const lang of ['ru', 'uz']) {
    const p = await ctx(b, 'teacher', { lang })
    const bodies = []
    await p.route('**/api/teacher/classes/*/assignments', (r) => {
      if (r.request().method() !== 'POST') return r.continue()
      bodies.push(r.request().postDataJSON())
      return r.fulfill({ status: 201, json: { id: 4242 } })
    })
    await p.goto(BASE + '/teacher/tasks')
    await T(p, 'task-due').waitFor({ timeout: 20000 })
    const vals = await optionValues(p, 'task-due')
    ok(`срок ${lang}: пять пресетов, последний — без срока`, vals.length === 5 && vals[4] === '', vals.join(','))
    const shown = await T(p, 'task-due').click().then(() => T(p, 'task-due-list').innerText())
    await p.keyboard.press('Escape')
    const [y, m, d] = vals[1].split('-').map(Number)
    ok(`срок ${lang}: в подписи «Завтра» настоящие день и месяц из словаря`, shown.includes(I18N[lang].cal.month[String(m - 1)]) && shown.includes(String(d)), shown.replace(/\n/g, ' | '))
    await T(p, 'task-title').fill('Тест срока')
    await pick(p, 'task-due', vals[1])
    await T(p, 'task-create').click()
    await p.waitForTimeout(500)
    ok(`срок ${lang}: «Завтра» уходит концом местного дня в UTC, язык = интерфейс`, bodies[0]?.due_at === new Date(y, m - 1, d, 23, 59, 59).toISOString() && bodies[0].lang === lang, JSON.stringify(bodies[0]))
    await T(p, 'task-title').fill('Без срока тест')
    await T(p, 'task-create').click()
    await p.waitForTimeout(500)
    ok(`срок ${lang}: после отправки сброс на «Без срока» — due_at null`, bodies[1]?.due_at === null, JSON.stringify(bodies[1]))
    ok('в консоли нет ошибок', p.errs.length === 0, p.errs.join(' | '))
    await p.context().close()
  }

  // ---------- Классы: копирование, новый класс через окно ----------
  {
    const p = await ctx(b, 'teacher')
    let created = null
    await p.route('**/api/teacher/classes', async (r) => {
      try {
      if (r.request().method() === 'POST') {
        created = r.request().postDataJSON().name
        return r.fulfill({ status: 201, json: { id: 777, name: created, code: 'ZZ9Q2X' } })
      }
      const j = await (await r.fetch()).json()
      await r.fulfill({ json: created ? [...j, { id: 777, name: created, code: 'ZZ9Q2X' }] : j })
      } catch { /* страница закрыта */ }
    })
    await p.goto(BASE + '/teacher/classes')
    await T(p, 'class-code').first().waitFor({ timeout: 20000 })
    const rooms = await (await p.request.get(`${BASE}/api/teacher/classes`)).json()
    const code = (await T(p, 'class-code').first().innerText()).trim()
    ok('class-code: текст без пробелов и переводов строки = код из API', code === rooms[0].code, JSON.stringify(code))
    await T(p, 'copy-code').first().click()
    ok('«Скопировано» видно', (await T(p, 'copy-note').first().innerText()) === I18N.ru.cl.copied)
    ok('в буфере код класса', (await p.evaluate(() => navigator.clipboard.readText())) === rooms[0].code)
    await p.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')) })
    await T(p, 'copy-code').first().click()
    ok('запрет буфера: видно «Не получилось скопировать», без падения', (await T(p, 'copy-note').first().innerText()) === I18N.ru.cl.copyFail && p.errs.length === 0, p.errs.join('|'))
    await T(p, 'new-class').click()
    ok('«Новый класс» открывает окно с полем', await T(p, 'class-name').isVisible())
    await T(p, 'class-name').fill('6Ц Звёзды')
    await T(p, 'class-create').click()
    await T(p, 'room-6Ц Звёзды').waitFor({ timeout: 10000 })
    ok('новый класс: окно закрылось, карточка в списке с кодом', (await T(p, 'class-modal').count()) === 0 && (await T(p, 'room-6Ц Звёзды').innerText()).replace(/\s/g, '').includes('ZZ9Q2X'))
    await T(p, 'open-4B Stars').click()
    ok('«Дети»: окно со списком детей из API', (await T(p, 'kids-modal').isVisible()) && (await T(p, 'kids-modal').locator('img').count()) > 0)
    await p.screenshot({ path: `${OUT}/classes-kids-1672.png` })
    await p.context().close()
  }

  // ---------- Тарифы из API ----------
  {
    const p = await ctx(b, 'parent', { lang: 'en' })
    await p.route('**/api/parent/tariffs', (r) => r.fulfill({ json: { purchase_available: false, packs: [{ id: 'a', coins: 7, price_usd: 1.5 }, { id: 'b', coins: 77, price_usd: 3 }, { id: 'c', coins: 777, price_usd: 12.34 }] } }))
    await p.goto(BASE + '/parent/plans')
    await T(p, 'plan-a').waitFor({ timeout: 20000 })
    const txt = (await T(p, 'plans').innerText()).replace(/\s+/g, ' ')
    ok('тарифы: числа и цены подменённого API на экране', ['7', '77', '777', '$1.50', '$3.00', '$12.34'].every((x) => txt.includes(x)) && !txt.includes('$2.00'), txt)
    ok('кнопки disabled, платёжных полей нет', (await T(p, 'plan-a').isDisabled()) && (await p.locator('input').count()) === 0)
    await p.unroute('**/api/parent/tariffs')
    await p.route('**/api/parent/tariffs', (r) => r.fulfill({ json: { purchase_available: false, packs: [{ id: 'x', coins: 11, price_usd: 0.99 }] } }))
    await p.reload()
    await T(p, 'plan-x').waitFor({ timeout: 20000 })
    ok('один пакет в API — одна карточка', (await T(p, 'plan-card').count()) === 1 && (await T(p, 'plans').innerText()).includes('$0.99'))
    await p.context().close()
  }

  // ---------- Без горизонтального скролла ----------
  const pages = [['child', '/tasks', 'tasks-title'], ['child', '/my-works', 'works-title'], ['teacher', '/teacher/tasks', 'task-form'], ['teacher', '/teacher/classes', 'new-class'], ['parent', '/parent/plans', 'plans'], ['parent', '/parent/review', 'notifications']]
  for (const lang of ['ru', 'uz']) {
    for (const w of [320, 390, 768, 1024, 1672]) {
      const bad = []
      for (const [who, path, sel] of pages) {
        const p = await ctx(b, who, { w, h: 900, lang })
        await p.goto(BASE + path)
        await T(p, sel).first().waitFor({ timeout: 20000 })
        await p.waitForTimeout(500)
        if ((await noScroll(p)) > 0) bad.push(`${path}:${await noScroll(p)}`)
        await p.context().close()
      }
      ok(`noScroll ${lang} ${w}`, bad.length === 0, bad.join(' '))
    }
  }
  await b.close()
  console.log(fails ? `FAILS: ${fails}` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
